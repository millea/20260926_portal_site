const shapes = {
  dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5Z"/>',
  chart:'<path d="M4 3v17h17M8 14l4-5 4 2 5-7"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  game:'<path d="M8 7h8c3 0 4 3 5 9 .4 3-2 4-4 2l-2-2H9l-2 2c-2 2-4.4 1-4-2C4 10 5 7 8 7Z"/><path d="M8 10v5m-2.5-2.5h5M16 11h.1m2 3h.1"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h2m4 0h2m-8 3h2"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  refresh:'<path d="M20 7a9 9 0 0 0-15-1L3 9m0-6v6h6M4 17a9 9 0 0 0 15 1l2-3m0 6v-6h-6"/>',
  settings:'<path d="m9 3 6 0 .5 3 2 1 3-.5 2 5-2.5 2v2l1.5 2.5-4 3-2.5-2h-2l-2.5 2-4-3L5 15.5v-2L2.5 12l2-5L7 7l2-1Z"/><circle cx="12" cy="12" r="3"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  sort:'<path d="M4 6h16M4 12h11M4 18h6"/>',
  bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
  inbox:'<path d="M4 4h16l2 11v5H2v-5L4 4Z"/><path d="M2 15h6l2 3h4l2-3h6"/>',
  activity:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  folder:'<path d="M3 6h7l2 3h9v11H3Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>'
};
export function icon(name) {
  const wrapper = document.createElement('span');
  // Only internal constant SVG paths are inserted. No feed content reaches innerHTML.
  wrapper.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${shapes[name] || shapes.folder}</svg>`;
  return wrapper.firstElementChild;
}
