import portal from './config/portal.json';
import {validateCategories, flattenFeeds, selectItems, safeUrl, formatDate} from './src/core.js';
import {icon} from './src/icons.js';
import {createBackend} from './src/backend.js';

const categories = validateCategories(portal.categories);
const dashboard = {id:'dashboard',label:'ダッシュボード',icon:'dashboard',description:'気になる情報を、ひとつの場所に。'};
const allCategories = [dashboard,...categories];
const $ = id => document.getElementById(id);
const state = {category:'dashboard',query:'',filter:'all',sort:'newest',feeds:[],items:[],preferences:{},gate:'loading',user:null};
let backend;
function el(tag, className='', text) { const node=document.createElement(tag); if(className) node.className=className; if(text!==undefined) node.textContent=text; return node; }
function categoryInfo(id) { return allCategories.find(c=>c.id===id)||dashboard; }
function categoryIcon(category) { const node=el('span',`category-icon ${category.color||''}`); node.append(icon(category.icon));return node; }
function notice(message) { $('notice').textContent=message; $('notice').hidden=!message; }
function openSettings() { renderSources(); $('settings-dialog').showModal(); }
function externalLink(url, text, className='') { const a=el('a',className,text); a.href=safeUrl(url)||'#';a.target='_blank';a.rel='noopener noreferrer';return a; }
function renderNavigation() {
  $('navigation').replaceChildren(...allCategories.map(category=>{
    const a=el('a',`nav-link ${state.category===category.id?'active':''}`);a.href=`#${category.id}`;
    if(state.category===category.id) a.setAttribute('aria-current','page');
    a.append(icon(category.icon),el('span','',category.label));
    const count=state.items.filter(i=>category.id==='dashboard'||i.category===category.id).length;
    a.append(el('span','nav-count',String(count)));return a;
  }));
  $('topic-count').textContent=`${categories.length} TOPICS`;
  $('category-overview').replaceChildren(...categories.map(category=>{
    const a=el('a','category-row');a.href=`#${category.id}`;
    a.append(categoryIcon(category),el('span','',category.label),el('span','row-count',`${state.items.filter(i=>i.category===category.id).length} 件`),el('span','row-chevron','›'));return a;
  }));
}
function renderStats() {
  const unread=state.items.filter(i=>!state.preferences[i.id]?.read).length;
  const saved=state.items.filter(i=>state.preferences[i.id]?.saved).length;
  const ok=state.feeds.filter(s=>s.status==='ok').length;
  const active=state.feeds.filter(s=>s.status!=='disabled').length;
  const cards=[['集まった情報',state.items.length,'件','すべてのカテゴリから','inbox'],['まだ読んでいない情報',unread,'件','次の発見が、待っています','clock'],['保存した情報',saved,'件','あとで、じっくり読みたいもの','bookmark'],['収集できた情報源',`${ok} / ${active}`,'','直近の収集結果','activity']];
  $('stats').replaceChildren(...cards.map(([label,value,unit,caption,glyph])=>{
    const card=el('div','stat-card'),head=el('div','stat-label'),symbol=el('span','stat-icon');symbol.append(icon(glyph));head.append(el('span','',label),symbol);
    const number=el('div','stat-value',String(value));number.append(el('span','',unit));card.append(head,number,el('div','stat-caption',caption));return card;
  }));
}
function renderSources() {
  const labels={ok:'取得成功',error:'取得失敗',disabled:'未設定・無効',pending:'未収集'};
  $('source-list').replaceChildren(...state.feeds.map(source=>{
    const row=el('div','source-row'),content=el('div','source-content');
    content.append(el('div','source-name',source.name),el('div','source-detail',`${categoryInfo(source.category).label} · ${source.type} · ${source.items?.length||0} 件`));
    if(source.lastSuccessAt) content.append(el('div','source-detail',`最終成功 ${formatDate(source.lastSuccessAt,true)}`));
    if(source.message) content.append(el('div','source-detail',source.message));
    row.append(categoryIcon(categoryInfo(source.category)),content,el('span',`source-badge ${source.status}`,labels[source.status]||'未収集'));return row;
  }));
  if(!state.feeds.length) $('source-list').append(el('p','dialog-intro','情報源の状態は、ログイン後またはローカル収集後に表示されます。'));
}
function renderSync() {
  const failures=state.feeds.filter(s=>s.status==='error').length;
  const latest=state.feeds.map(s=>s.lastSuccessAt).filter(Boolean).sort().at(-1);
  const isStale=latest&&Date.now()-Date.parse(latest)>12*60*60*1000;
  const status=failures?`${failures} 件の情報源で取得失敗`:isStale?'最終成功から12時間以上経過':latest?'収集データを表示中':'まだ収集されていません';
  const line=el('div','sync-status');line.append(el('span','live-dot'),el('span','',status));
  const meta=el('div','sync-meta','最後に収集できた時刻');meta.append(el('strong','',latest?formatDate(latest,true):'未収集'));
  $('sync-summary').replaceChildren(line,meta,el('div','sync-meta','更新予定 03:17 / 09:17 / 15:17 / 21:17 JST'));
  $('feed-footer-text').textContent=failures?'取得失敗の情報源は、前回成功時の情報を表示します':latest?`最終成功 ${formatDate(latest,true)} · 情報源の更新頻度により内容は異なります`:'情報源を設定すると、ここに情報が集まります';
  if($('settings-dialog').open) renderSources();
}
async function updatePreference(id,key,value) {
  const previous=state.preferences[id]||{};
  state.preferences={...state.preferences,[id]:{...previous,[key]:value}};
  renderStats();renderArticles();
  try { await backend.save(id,{[key]:value}); }
  catch { state.preferences={...state.preferences,[id]:previous};renderStats();renderArticles();notice('保存に失敗しました。接続状態を確認して、もう一度お試しください。'); }
}
function renderArticles() {
  const items=selectItems(state.items,{...state,preferences:state.preferences});
  $('result-count').textContent=items.length;
  $('filter-caption').textContent=state.category==='dashboard'?'すべてのカテゴリ':categoryInfo(state.category).label;
  document.querySelectorAll('[data-filter]').forEach(button=>{const selected=button.dataset.filter===state.filter;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
  const nodes=items.map(item=>{
    const pref=state.preferences[item.id]||{},category=categoryInfo(item.category);
    const article=el('article',`article ${pref.read?'read':''}`),body=el('div','article-content'),meta=el('div','article-meta');
    meta.append(el('span','category-tag',category.label),el('span','meta-separator'),el('span','',item.source));
    if(!pref.read){const dot=el('span','unread-dot');dot.title='未読';meta.append(dot);}
    const title=el('h3'),link=externalLink(item.url,item.title);title.append(link);
    link.addEventListener('click',()=>{if(!pref.read) void updatePreference(item.id,'read',true);});
    const bottom=el('div','article-bottom'),time=el('time','',formatDate(item.publishedAt));if(item.publishedAt)time.dateTime=item.publishedAt;
    const read=el('button','read-button',pref.read?'未読に戻す':'既読にする');read.setAttribute('aria-label',`${item.title}を${pref.read?'未読':'既読'}にする`);read.onclick=()=>updatePreference(item.id,'read',!pref.read);bottom.append(time,read);
    body.append(meta,title);if(item.summary)body.append(el('p','article-summary',item.summary));body.append(bottom);
    const save=el('button',`save-button ${pref.saved?'saved':''}`);save.append(icon('bookmark'));save.setAttribute('aria-label',`${item.title}の保存を${pref.saved?'解除':'追加'}`);save.setAttribute('aria-pressed',String(!!pref.saved));save.onclick=()=>updatePreference(item.id,'saved',!pref.saved);
    article.append(categoryIcon(category),body,save);return article;
  });
  $('article-list').replaceChildren(...nodes);
  if(!nodes.length){const empty=el('div','empty-state'),symbol=el('div','empty-icon');symbol.append(icon(state.filter==='saved'?'bookmark':'inbox'));empty.append(symbol);
    const filtered=state.query||state.filter!=='all';
    empty.append(el('h3','',filtered?'該当する情報がありません':'ここから、情報が集まります。'),el('p','',filtered?'検索条件や絞り込みを変えてみてください。':'このカテゴリの情報源を設定すると、収集された記事をここで確認できます。'));
    const button=el('button','',filtered?'絞り込みをリセット':'情報源を確認する');button.onclick=filtered?()=>{state.query='';state.filter='all';$('search').value='';renderArticles();}:openSettings;empty.append(button);$('article-list').append(empty);
  }
}
function renderWatchlist() {
  const llm=state.category==='llm';
  $('watchlist').hidden=state.category!=='investment'&&!llm;
  if($('watchlist').hidden)return;
  $('watchlist').setAttribute('aria-label',llm?'LLM性能比較の情報源':'日米の主要指数・主要株');
  const links=el('div','watch-links');
  for(const item of llm?portal.benchmarks:portal.watchlist){const a=externalLink(item.url,item.name,'watch-link');a.append(el('small','',`${item.symbol} ↗`));links.append(a);}
  $('watchlist').replaceChildren(el('h2','',llm?'ベンチマークを、複数の視点から。':'マーケット・ウォッチ'),el('p','',llm?'比較サイトで最新のスコア・評価条件・更新日を確認できます。数値の自動取得は未接続です。':'日米の主要指数・主要株の確認用リンクです。価格APIは未接続のため、現在値は各情報源で確認できます。'),links);
}
function render() {
  const category=categoryInfo(state.category);$('page-title').textContent=category.label;$('page-description').textContent=category.description||`${category.label}の情報をまとめて確認。`;$('breadcrumb-current').textContent=category.label;document.title=`MATO — ${category.label}`;
  renderNavigation();renderStats();renderArticles();renderSync();renderWatchlist();
}
function gate(status,user) {
  state.gate=status;state.user=user;
  const allowed=status==='preview'||status==='ready';$('workspace-content').hidden=!allowed;$('auth-gate').hidden=allowed;
  $('auth-button').textContent=status==='preview'?'プレビュー':user?'ログアウト':'ログイン';$('auth-button').disabled=status==='preview'||status==='loading';
  $('gate-login').hidden=!!user||status==='loading';
  $('gate-title').textContent=status==='denied'?'このアカウントには閲覧権限がありません':status==='loading'?'接続を確認しています…':status==='error'?'接続を確認してください':'自分だけの情報スペースへ。';
  $('gate-message').textContent=status==='denied'?`管理者がFirebaseで許可を登録してください。ユーザーUID: ${user.uid}`:status==='loading'?'しばらくお待ちください。':status==='error'?'設定・ネットワークを確認し、上部の再読込を押してください。':'Googleアカウントでログインすると、情報の閲覧と保存ができます。';
  $('storage-note').textContent=status==='preview'?'プレビュー：既読・保存はこのブラウザのみ':'既読・保存は自分の端末間で同期';
  if(status==='preview')notice('ローカルプレビュー · Firebase未接続。公開情報で画面を確認できます。既読・保存はこのブラウザだけに記録されます。');
  else notice('');
  if(!allowed && $('settings-dialog').open)renderSources();
}
const mobileQuery=window.matchMedia('(max-width: 760px)');
function closeMenu(){ $('sidebar').classList.remove('open');$('sidebar').inert=mobileQuery.matches;$('backdrop').hidden=true;$('menu-toggle').setAttribute('aria-expanded','false'); }
function navigate(){const candidate=location.hash.slice(1);state.category=allCategories.some(c=>c.id===candidate)?candidate:'dashboard';state.filter='all';closeMenu();render();}
for(const target of document.querySelectorAll('[data-icon]'))target.append(icon(target.dataset.icon));
$('today').textContent=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
$('search').addEventListener('input',event=>{state.query=event.target.value;renderArticles();});
$('sort').addEventListener('change',event=>{state.sort=event.target.value;renderArticles();});
for(const button of document.querySelectorAll('[data-filter]'))button.onclick=()=>{state.filter=button.dataset.filter;renderArticles();};
for(const id of ['settings-open','intro-settings','sync-details'])$(id).onclick=openSettings;
$('settings-close').onclick=()=>$('settings-dialog').close();
$('settings-dialog').addEventListener('click',event=>{if(event.target===$('settings-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
$('menu-toggle').onclick=()=>{const isOpen=$('sidebar').classList.toggle('open');$('sidebar').inert=!isOpen&&mobileQuery.matches;$('backdrop').hidden=!isOpen;$('menu-toggle').setAttribute('aria-expanded',String(isOpen));};
$('backdrop').onclick=closeMenu;
mobileQuery.addEventListener('change',closeMenu);
window.addEventListener('hashchange',navigate);
window.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('settings-dialog').open){event.preventDefault();$('search').focus();}});
async function login(){try{await backend.login();}catch(error){notice(error.code==='auth/popup-closed-by-user'?'ログインをキャンセルしました。':'ログインできませんでした。Google認証・許可ドメイン・ポップアップ設定を確認してください。');}}
$('gate-login').onclick=login;
$('auth-button').onclick=async()=>{if(state.user){try{await backend.logout();}catch{notice('ログアウトに失敗しました。もう一度お試しください。');}}else await login();};
$('refresh').onclick=async()=>{if(!backend)return;$('refresh').disabled=true;try{await backend.refresh();}catch{notice('再読込に失敗しました。');}finally{$('refresh').disabled=false;}};
navigate();gate('loading',null);
try { backend=createBackend({onGate:gate,onFeed:feeds=>{state.feeds=feeds;state.items=flattenFeeds(feeds,categories);render();},onPreferences:preferences=>{state.preferences=preferences;renderStats();renderArticles();},onError:notice}); }
catch(error){gate('error',null);notice(error.message);}
