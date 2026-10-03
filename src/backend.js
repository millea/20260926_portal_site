import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, getDocFromServer, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

export function createBackend({ onGate, onFeed, onPreferences, onError }) {
  let config = null;
  try { config = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || 'null'); } catch { onError('Firebase設定がJSON形式ではありません。'); }
  const configured = config && ['apiKey','projectId','authDomain','appId'].every(key => typeof config[key] === 'string' && config[key]);
  if (!configured && import.meta.env.DEV) return createPreview({onGate,onFeed,onPreferences,onError});
  if (!configured) throw new Error('Firebase設定がありません。管理者に確認してください。');
  const app = initializeApp(config);
  const auth = getAuth(app), db = getFirestore(app);
  let unsubscribers = [], generation = 0, activeUid = null;
  const clear = () => { activeUid = null; unsubscribers.forEach(fn => fn()); unsubscribers = []; onFeed([]); onPreferences({}); };
  const fail = (message) => { generation++; clear(); onGate('error', auth.currentUser); onError(message); };
  async function connect(user) {
    const run = ++generation;
    clear();
    if (!user) { onGate('signed-out', null); return; }
    onGate('loading', user);
    try {
      const access = await getDocFromServer(doc(db, 'access', user.uid));
      if (run !== generation) return;
      if (!access.exists() || access.data().enabled !== true) { onGate('denied',user); return; }
      activeUid = user.uid;
      onGate('ready', user);
      unsubscribers.push(onSnapshot(collection(db,'feeds'), snapshot => {
        if (run === generation) onFeed(snapshot.docs.map(d => d.data()));
      }, () => { if (run === generation) fail('情報を取得できません。接続または閲覧権限を確認し、再読込してください。'); }));
      unsubscribers.push(onSnapshot(collection(db,'users',user.uid,'items'), snapshot => {
        if (run === generation) onPreferences(Object.fromEntries(snapshot.docs.map(d => [d.id,d.data()])));
      }, () => { if (run === generation) fail('既読・保存の同期に失敗しました。接続とFirestoreルールを確認してください。'); }));
    } catch { if (run === generation) fail('Firebaseへの接続に失敗しました。再読込、または認証ドメイン・Firestore設定を確認してください。'); }
  }
  onAuthStateChanged(auth, connect, () => fail('認証状態を確認できません。ページを再読み込みしてください。'));
  return {
    mode:'firebase',
    async login() { await signInWithPopup(auth,new GoogleAuthProvider()); },
    async logout() { await signOut(auth); },
    async refresh() { await connect(auth.currentUser); },
    async save(id, patch) {
      if (!activeUid || activeUid !== auth.currentUser?.uid) throw new Error('ログインが必要です');
      await setDoc(doc(db,'users',activeUid,'items',id), {...patch,updatedAt:serverTimestamp()}, {merge:true});
    }
  };
}

function createPreview({onGate,onFeed,onPreferences,onError}) {
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem('mato.preview.v1') || '{}'); if (!preferences || Array.isArray(preferences) || typeof preferences !== 'object') preferences = {}; } catch { preferences = {}; }
  async function refresh() {
    onGate('preview',null);
    onPreferences(preferences);
    try {
      // Dev server only. This file is deliberately excluded from production builds.
      const response = await fetch('/data/local-feed.json', {cache:'no-store'});
      if (!response.ok) throw new Error('no preview');
      const data = await response.json();
      if (!Array.isArray(data.sources)) throw new Error('invalid preview');
      onFeed(data.sources);
    } catch { onFeed([]); onError('プレビューデータがありません。python scripts/collect.py --local を実行してください。'); }
  }
  queueMicrotask(refresh);
  return {mode:'preview',login:async()=>{},logout:async()=>{},refresh,
    async save(id, patch) {
      preferences = {...preferences,[id]:{...preferences[id],...patch}};
      try { localStorage.setItem('mato.preview.v1',JSON.stringify(preferences)); } catch { onError('ブラウザへの保存ができません。この画面を閉じると既読・保存は失われます。'); }
      onPreferences(preferences);
    }
  };
}
