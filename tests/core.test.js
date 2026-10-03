import test from 'node:test';
import assert from 'node:assert/strict';
import {safeUrl,validateCategories,flattenFeeds,selectItems,formatDate} from '../src/core.js';
const items=[{id:'a',category:'ai',title:'Model update',summary:'Research',source:'Lab',publishedAt:'2026-10-02T00:00:00Z',url:'https://example.com/a'},{id:'b',category:'weather',title:'Tokyo forecast',summary:'Sun',source:'Weather',publishedAt:'2026-10-03T00:00:00Z',url:'https://example.com/b'},{id:'c',category:'ai',title:'Undated',summary:'',source:'Lab',publishedAt:null,url:'https://example.com/c'}];
test('filters compose category, words, unread and saved',()=>{
  assert.deepEqual(selectItems(items,{category:'ai',query:'model research',filter:'saved',preferences:{a:{saved:true}}}).map(i=>i.id),['a']);
  assert.deepEqual(selectItems(items,{filter:'unread',preferences:{b:{read:true}}}).map(i=>i.id),['a','c']);
});
test('unknown dates stay last in both sort orders',()=>{
  assert.deepEqual(selectItems(items).map(i=>i.id),['b','a','c']);
  assert.deepEqual(selectItems(items,{sort:'oldest'}).map(i=>i.id),['a','b','c']);
});
test('unsafe URLs rejected',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,hello','/relative','https://user:pass@example.com'])assert.equal(safeUrl(url),null);
  assert.equal(safeUrl('https://example.com'),'https://example.com/');
});
test('categories extend without changing UI logic',()=>{
  const categories=validateCategories([{id:'books',label:'本'}]);
  const book={...items[0],category:'books'};
  assert.equal(flattenFeeds([{items:[book,book,items[1]]}],categories).length,1);
  assert.throws(()=>validateCategories([{id:'dashboard',label:'x'}]));
  assert.throws(()=>validateCategories([{id:'ai',label:'A'},{id:'ai',label:'B'}]));
});
test('Japanese dates use JST and tolerate missing dates',()=>{
  assert.match(formatDate('2026-10-02T23:00:00Z'),/10\/03.*08:00/);
  assert.equal(formatDate(null),'日時不明');
});
