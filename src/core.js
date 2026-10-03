export function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function validateCategories(categories) {
  const ids = new Set(['dashboard']);
  for (const category of categories) {
    if (!/^[a-z][a-z0-9-]*$/.test(category.id) || ids.has(category.id) || !category.label) throw new Error('カテゴリ設定が不正です');
    ids.add(category.id);
  }
  return categories;
}
export function flattenFeeds(feeds, categories) {
  const allowed = new Set(categories.map(c => c.id));
  const items = new Map();
  for (const feed of feeds) for (const item of feed.items || []) {
    if (item.id && item.title && allowed.has(item.category) && safeUrl(item.url)) items.set(item.id, item);
  }
  return [...items.values()];
}
export function selectItems(items, {category='dashboard', query='', filter='all', sort='newest', preferences={}} = {}) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    const state = preferences[item.id] || {};
    const text = `${item.title} ${item.summary} ${item.source}`.toLocaleLowerCase();
    return (category === 'dashboard' || item.category === category) && words.every(word => text.includes(word)) && (filter !== 'saved' || state.saved) && (filter !== 'unread' || !state.read);
  }).sort((a,b) => {
    const dateA = Date.parse(a.publishedAt), dateB = Date.parse(b.publishedAt);
    if (!Number.isFinite(dateA) && !Number.isFinite(dateB)) return a.id.localeCompare(b.id);
    if (!Number.isFinite(dateA)) return 1;
    if (!Number.isFinite(dateB)) return -1;
    return (dateB - dateA) * (sort === 'oldest' ? -1 : 1) || a.id.localeCompare(b.id);
  });
}
export function formatDate(value, full=false) {
  if (!value || !Number.isFinite(Date.parse(value))) return '日時不明';
  return new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',year:full?'numeric':undefined,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
}
