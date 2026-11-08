'use strict';
/* =========================================================
   Stowage Plan PWA – offline, single user, data on device
   ========================================================= */

/* ---------- Constants ---------- */
const DECKS = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const GC = 16, GR = 8;                 // hold paint grid (fore-aft x athwartships)
const D5W = 1000, D5H = 300;           // deck 5 drawing space (matches deck5.png, 1611 x 484)
const D5HOLDS = [{ h: 4, x0: 0, x1: 275 }, { h: 3, x0: 275, x1: 581 }, { h: 2, x0: 581, x1: 813 }, { h: 1, x0: 813, x1: 1000 }];
const D5IMG = new Image(); D5IMG.src = 'deck5.png';
// map a deck 5 x position into the equal-width hold columns of the ship overview (0..1)
function d5Col(x) { const z = D5HOLDS.find(q => x <= q.x1) || D5HOLDS[3]; const j = D5HOLDS.indexOf(z); return (j + clamp((x - z.x0) / (z.x1 - z.x0), 0, 1)) / 4; }
const PALETTE = [
  ['Pink', '#FF99FF'], ['Yellow', '#FFFF00'], ['Turquoise', '#00FFFF'], ['Light green', '#92D050'],
  ['Light blue', '#00B0F0'], ['Tan', '#FFCC99'], ['Orange', '#FFC000'], ['Bright green', '#00FF00'],
  ['Lavender', '#CC99FF'], ['Rose', '#FF99CC'], ['Light turquoise', '#CCFFFF'], ['Gold', '#FFD966'],
  ['Red', '#FF0000'], ['Blue', '#0070C0'], ['Green', '#00B050'], ['Purple', '#7030A0']
];
const LIGHT = { bg: '#ffffff', hull: '#f3f6fa', cell: '#ffffff', void: '#e2e8f0', line: '#6f839e', ink: '#0e2036', muted: '#55687f', accent: '#f2b300' };
const ALIAS = { ZAPLZ: 'Port Elizabeth' };
const HEIGHTS = [['lt18', 'Under 1.8 m', '<1.8m', '#9fb3c8'], ['18-21', 'Between 1.8 and 2.1 m', '1.8-2.1m', '#ff9f1c'], ['gt21', 'Over 2.1 m', '>2.1m', '#e5383b']];
const heightOf = (d, h) => { const o = ship().holds[d + '-' + h]; return o && o.height ? HEIGHTS.find(x => x[0] === o.height) : null; };
function heightSelect(d, h) {
  const o = ship().holds[d + '-' + h], v = (o && o.height) || '';
  return `<label class="fld inline hsel"><span>Unit height</span><select data-hbind="${d}-${h}"><option value="">Not set</option>${HEIGHTS.map(x => `<option value="${x[0]}" ${v === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></label>`;
}

function holdsFor(d) {
  if (d === 1 || d === 2) return [3, 2];
  if (d === 3 || d === 4) return [3, 2, 1];
  if (d === 12) return [4, 3, 2];
  return [4, 3, 2, 1];
}
const holdOfX = x => (D5HOLDS.find(q => x < q.x1) || D5HOLDS[3]).h;

/* ---------- Utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const fmt = (n, d = 0) => { n = Math.round(n * 10 ** d) / 10 ** d; return d ? n.toFixed(d) : String(n); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hexRgb(h) { h = (h || '#cccccc').replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); }
function textOn(h) { const [r, g, b] = hexRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0e2036' : '#ffffff'; }
function toast(msg, ms = 2600) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
function modal(html, bind) {
  const ov = document.createElement('div'); ov.className = 'modal-ov';
  ov.innerHTML = `<div class="modal" role="dialog">${html}</div>`; document.body.append(ov);
  return new Promise(res => { bind(ov, v => { ov.remove(); res(v); }); });
}
function confirmBox(msg, ok = 'Delete', danger = true) {
  return modal(`<p>${esc(msg)}</p><div class="modal-btns"><button class="btn" data-v="0">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-v="1">${esc(ok)}</button></div>`,
    (ov, done) => ov.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1'); }));
}
function inputBox(label, val = '', ok = 'Save') {
  return modal(`<label class="fld"><span>${esc(label)}</span><input id="mi" value="${esc(val)}"></label><div class="modal-btns"><button class="btn" data-v="0">Cancel</button><button class="btn primary" data-v="1">${esc(ok)}</button></div>`,
    (ov, done) => { const i = $('#mi', ov); setTimeout(() => i.focus(), 50); ov.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1' ? i.value.trim() : null); }); });
}

/* ---------- Icons ---------- */
const I = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>',
  bin: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
  grip: '<svg viewBox="0 0 24 24"><path d="M5 8h14M5 12h14M5 16h14"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-3"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'
};

/* ---------- Storage (IndexedDB, localStorage fallback) ---------- */
const DBN = 'stowage-pwa', STORE = 'kv';
function idb() { return new Promise((res, rej) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function dbGet(k) { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function dbSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }

let S = null, saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    S.savedAt = Date.now();
    try { await dbSet('state', JSON.parse(JSON.stringify(S))); }
    catch (e) { try { localStorage.setItem('stowage-state', JSON.stringify(S)); } catch (e2) { toast('Saving failed. Export a backup from the Export tab.'); } }
  }, 250);
}
async function load() {
  try { S = await dbGet('state'); } catch (e) { S = null; }
  if (!S) { try { S = JSON.parse(localStorage.getItem('stowage-state')); } catch (e) { S = null; } }
  if (!S || !Array.isArray(S.ships) || !S.ships.length) S = { v: 1, ships: [seedShip()] };
  if (!S.shipId || !S.ships.some(s => s.id === S.shipId)) S.shipId = S.ships[0].id;
  S.ships.forEach(fixShip);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
}
function newShip(name) {
  // deck5.v2 marks the current deck 5 coordinate system
  const w = name.trim().toUpperCase().split(/\s+/);
  return { id: uid(), name, short: (w[0] || 'SHIP').slice(0, 3) + (w[1] ? w[1][0] : ''), voyage: '', depDate: '', ports: [], activePol: null, holds: {}, deck5: { shapes: [], v2: true }, email: 'vppetrov88@gmail.com' };
}
function fixShip(s) {
  s.holds ||= {}; s.deck5 ||= { shapes: [] }; s.ports ||= []; s.email ||= 'vppetrov88@gmail.com';
  if (!s.deck5.v2) {
    const OLD = [0, 250, 500, 750, 1000], NEW = [0, 275, 581, 813, 1000];
    const mx = x => { const j = clamp(Math.floor(x / 250), 0, 3); return NEW[j] + (x - OLD[j]) / 250 * (NEW[j + 1] - NEW[j]); }, my = y => y * 300 / 340;
    s.deck5.shapes.forEach(q => {
      if (q.type === 'free') q.pts = q.pts.map(p => [mx(p[0]), my(p[1])]);
      else if (q.type === 'ev') { const cx = mx(q.x + q.w / 2), cy = my(q.y + q.h / 2); q.x = cx - q.w / 2; q.y = cy - q.h / 2; }
      else { const x1 = mx(q.x + q.w); q.x = mx(q.x); q.w = x1 - q.x; q.y = my(q.y); q.h = my(q.h); }
    });
    s.deck5.v2 = true;
  }
}
function seedShip() {
  const s = newShip('Dover Highway'); s.short = 'DOVH'; s.voyage = '132A'; s.depDate = '2026-11-04';
  const P = (locode, name, code, type, color) => ({ id: uid(), locode, name, code, type, color: color || null, expUnits: '', expPkgs: '' });
  s.ports = [
    P('JPUKB', 'Kobe', 'UKB', 'L'), P('JPSAK', 'Sakai', 'SAK', 'L'), P('JPYOK', 'Yokohama', 'YOK', 'L'),
    P('JPNGO', 'Nagoya', 'NGO', 'L'), P('CNSGH', 'Shanghai', 'SHA', 'L'), P('SGSIN', 'Singapore', 'SIN', 'L'),
    P('INENR', 'Ennore', 'ENR', 'L'), P('ZADUR', 'Durban', 'DUR', 'L'), P('ZAPLZ', 'Port Elizabeth', 'PLZ', 'L'),
    P('TZDAR', 'Dar es Salaam', 'DAR', 'D', '#FF99FF'), P('KEMBA', 'Mombasa', 'MBA', 'D', '#FFFF00'),
    P('SGSIN', 'Singapore-2', 'SIN2', 'D', '#00FFFF'), P('IDJKT', 'Jakarta', 'JKT', 'D', '#92D050')
  ];
  s.activePol = s.ports[8].id;
  return s;
}

/* ---------- Model helpers ---------- */
const ship = () => S.ships.find(x => x.id === S.shipId) || S.ships[0];
const P = id => ship().ports.find(p => p.id === id);
const code = id => (P(id) ? P(id).code : '?');
const colorOf = id => (P(id) && P(id).color) || '#cfd8e3';
const dischPorts = () => ship().ports.filter(p => p.type !== 'L');
const loadPorts = () => ship().ports.filter(p => p.type !== 'D');
const rotation = sh => (sh.voyage ? sh.voyage + '=' : '') + sh.ports.map(p => p.code).join('=>');
function getHold(d, h, create) {
  const sh = ship(), k = d + '-' + h; let o = sh.holds[k];
  if (!o && create) o = sh.holds[k] = { cells: new Array(GC * GR).fill(null), entries: [], arrows: [], evs: [] };
  if (o && !o.arrows) o.arrows = [];
  if (o && !o.evs) o.evs = [];
  return o;
}
function bbox(s) {
  if (s.type === 'free') { const xs = s.pts.map(p => p[0]), ys = s.pts.map(p => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}
const shapeHold = s => { const b = bbox(s); return holdOfX(b.x + b.w / 2); };
function mafiTotals(s) {
  const loaded = s.mafis.filter(m => m.loaded), empty = s.mafis.length - loaded.length;
  return {
    pkgs: loaded.reduce((a, m) => a + num(m.pkgs), 0) + (empty > 0 ? 1 : 0),
    mt: s.mafis.reduce((a, m) => a + num(m.mt) + num(m.tara), 0)
  };
}
// Every cargo record on board: one row per hold entry / deck 5 item
function cargoRows(sh = ship()) {
  const rows = [];
  for (const k in sh.holds) {
    const [d, h] = k.split('-').map(Number);
    for (const e of sh.holds[k].entries) rows.push({ deck: d, hold: h, pod: e.pod, pol: e.pol, units: num(e.units), pkgs: 0, mafis: 0, mt: 0, brand: e.brand || '' });
  }
  for (const s of sh.deck5.shapes) {
    if (s.type === 'ev') continue;
    const hold = shapeHold(s);
    if (s.type === 'mafi') { const t = mafiTotals(s); rows.push({ deck: 5, hold, pod: s.pod, pol: s.pol, units: 0, pkgs: t.pkgs, mafis: s.mafis.length, mt: t.mt, brand: s.mafis.length > 1 ? 'MAFI stack' : 'MAFI' }); }
    else rows.push({ deck: 5, hold, pod: s.pod, pol: s.pol, units: num(s.units), pkgs: 0, mafis: 0, mt: 0, brand: s.label || '' });
  }
  return rows;
}
const evCount = sh => Object.values(sh.holds).reduce((a, o) => a + (o.evs ? o.evs.length : 0), 0) + sh.deck5.shapes.filter(s => s.type === 'ev').length;
function sumRows(rows) { return rows.reduce((a, r) => (a.units += r.units, a.pkgs += r.pkgs, a.mt += r.mt, a.mafis += r.mafis, a), { units: 0, pkgs: 0, mt: 0, mafis: 0 }); }
function expStatus(p, act) {
  const eu = p.expUnits === '' || p.expUnits == null ? null : num(p.expUnits);
  const ep = p.expPkgs === '' || p.expPkgs == null ? null : num(p.expPkgs);
  if (eu === null && ep === null) return { s: 'none' };
  const ok = (eu === null || eu === act.units) && (ep === null || ep === act.pkgs);
  return { s: ok ? 'ok' : 'off', eu, ep };
}
function mafiList(sh = ship()) {
  const items = sh.deck5.shapes.filter(s => s.type === 'mafi').map(s => ({ s, hold: shapeHold(s), x: bbox(s).x }));
  items.sort((a, b) => b.hold - a.hold || a.x - b.x);
  const out = []; const stackNo = {};
  for (const it of items) {
    const st = it.s.mafis.length > 1 ? 'Stack ' + (stackNo[it.hold] = (stackNo[it.hold] || 0) + 1) : '';
    it.s.mafis.forEach(m => out.push({ id: it.s.id, hold: it.hold, podpol: code(it.s.pod) + '/' + code(it.s.pol), color: colorOf(it.s.pod), no: m.no, stack: st, loaded: m.loaded, pkgs: m.loaded ? num(m.pkgs) : 0, mt: m.loaded ? num(m.mt) : 0, tara: num(m.tara) }));
  }
  return out;
}

/* ---------- UN/LOCODE ---------- */
let LOC = null;
async function locode() {
  if (LOC) return LOC;
  const r = await fetch('locode.json'); const d = await r.json();
  const cn = {}; for (const k in d.c) cn[k] = d.c[k].replace(/\s*\(the\)/i, '');
  LOC = d.p.map(([c, n]) => ({ c, n, u: (n + ' ' + (ALIAS[c] || '')).toUpperCase(), cn: cn[c.slice(0, 2)] || c.slice(0, 2) }));
  return LOC;
}
async function searchLoc(q) {
  q = q.trim().toUpperCase(); if (q.length < 2) return [];
  const L = await locode(); const res = [];
  for (const x of L) {
    let sc = -1;
    if (x.c === q) sc = 0; else if (x.c.startsWith(q) || x.c.slice(2).startsWith(q)) sc = 1;
    else if (x.u.startsWith(q)) sc = 2; else if (x.u.includes(' ' + q) || x.u.includes('/' + q)) sc = 3; else if (q.length > 2 && x.u.includes(q)) sc = 4;
    if (sc >= 0) res.push([sc, x]);
  }
  res.sort((a, b) => a[0] - b[0] || a[1].n.localeCompare(b[1].n));
  return res.slice(0, 40).map(r => r[1]);
}
function resultsHtml(list, act, extra = '') {
  if (!list.length) return '';
  return `<ul class="sres">${list.map(x => `<li><button data-act="${act}" data-code="${x.c}" data-name="${esc(ALIAS[x.c] || x.n)}" ${extra}><b>${esc(ALIAS[x.c] || x.n)}</b><span>${esc(x.cn)}</span><code>${x.c}</code></button></li>`).join('')}</ul>`;
}
function uniqueCode(base, exceptId) {
  const used = new Set(ship().ports.filter(p => p.id !== exceptId).map(p => p.code)); let c = base, n = 2;
  while (used.has(c)) c = base + n++;
  return c;
}
function nextColor() { const used = new Set(ship().ports.map(p => p.color)); const f = PALETTE.find(c => !used.has(c[1])); return f ? f[1] : PALETTE[0][1]; }

/* ---------- UI state ---------- */
const UI = { view: 'home', tab: 'ship', deck: 7, hold: 3, mode: 'paint', pod: null, undo: [], d5: { tool: 'select', sel: null, zoom: null }, pdf: null, openPort: null };
const app = document.getElementById('app');
function render() {
  const y = window.scrollY;
  app.className = 'view-' + UI.view;
  ({ home: renderHome, plan: renderPlan, hold: renderHold, deck5: renderDeck5 })[UI.view]();
  if (UI.keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  UI.keepScroll = false;
}
function rerender() { UI.keepScroll = true; render(); }
function cssTheme() {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  return { bg: g('--surface'), hull: g('--hull'), cell: g('--cell'), void: g('--void'), line: g('--line'), ink: g('--ink'), muted: g('--muted'), accent: g('--accent') };
}
function setupCanvas(cv, w, h) {
  const r = window.devicePixelRatio || 1; cv.width = Math.round(w * r); cv.height = Math.round(h * r);
  cv.style.width = w + 'px'; cv.style.height = h + 'px'; const ctx = cv.getContext('2d'); ctx.setTransform(r, 0, 0, r, 0, 0); return ctx;
}
const portOpts = (list, sel) => list.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.code)} – ${esc(p.name)}</option>`).join('');

/* =========================================================
   HOME
   ========================================================= */
function renderHome() {
  const sh = ship();
  app.innerHTML = `
  <main class="home">
    <svg class="home-ship" viewBox="0 0 360 110" aria-hidden="true">
      <path d="M8 30 H300 Q352 34 354 62 Q350 92 296 100 H22 L8 86 Z" class="h-hull"/>
      ${[0, 1, 2, 3, 4, 5].map(i => `<line x1="10" x2="${346 - Math.abs(i - 2) * 6}" y1="${40 + i * 10}" y2="${40 + i * 10}" class="h-deck"/>`).join('')}
      ${[80, 160, 240].map(x => `<line x1="${x}" x2="${x}" y1="30" y2="100" class="h-deck"/>`).join('')}
      <rect x="24" y="14" width="46" height="16" class="h-house"/>
    </svg>
    <p class="home-k">Cargo stowage plan</p>
    <label class="ship-pick">
      <span class="sr">Ship</span>
      <select id="shipSel">${S.ships.map(s => `<option value="${s.id}" ${s.id === sh.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="__add">Add ship…</option></select>
    </label>
    <p class="home-meta">Voyage ${esc(sh.voyage || '–')}${sh.depDate ? ', ' + esc(new Date(sh.depDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })) : ''}</p>
    <p class="home-rot">${esc(rotation(sh)) || 'No ports added yet'}</p>
    <button class="btn primary big" data-act="open">Open stowage plan</button>
    <p class="home-foot">Everything is saved on this iPhone and works without internet.${S.savedAt ? ' Last saved ' + new Date(S.savedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) + '.' : ''}</p>
  </main>`;
  $('#shipSel').onchange = async e => {
    if (e.target.value === '__add') {
      const n = await inputBox('New ship name', '', 'Add ship');
      if (n) { const s = newShip(n); S.ships.push(s); S.shipId = s.id; save(); }
      render(); return;
    }
    S.shipId = e.target.value; save(); render();
  };
}

/* =========================================================
   PLAN (tabs)
   ========================================================= */
const TABS = [['ship', 'Ship'], ['ports', 'Ports'], ['summary', 'Summary'], ['mafis', 'MAFIs'], ['export', 'Export']];
function renderPlan() {
  const sh = ship();
  app.innerHTML = `
  <header class="top">
    <button class="ic" data-act="home" aria-label="Ships">${I.back}</button>
    <div class="ttl"><b>${esc(sh.name)}</b><span>Voyage ${esc(sh.voyage || '–')}${sh.activePol ? ', loading at ' + esc(code(sh.activePol)) : ''}</span></div>
  </header>
  <nav class="tabs">${TABS.map(([k, n]) => `<button data-act="tab" data-v="${k}" class="${UI.tab === k ? 'on' : ''}">${n}</button>`).join('')}</nav>
  <section class="tabbody">${({ ship: tabShip, ports: tabPorts, summary: tabSummary, mafis: tabMafis, export: tabExport })[UI.tab]()}</section>`;
  ({ ship: afterShip, ports: afterPorts, summary: () => { }, mafis: () => { }, export: () => { } })[UI.tab]();
}

/* Stowage direction arrow (coordinates in pixels) */
function drawArrow(ctx, x1, y1, x2, y2, w) {
  const a = Math.atan2(y2 - y1, x2 - x1), hl = Math.max(w * 3.2, 6);
  const path = () => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(a) * hl * 0.6, y2 - Math.sin(a) * hl * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(a - 0.45), y2 - hl * Math.sin(a - 0.45));
    ctx.lineTo(x2 - hl * Math.cos(a + 0.45), y2 - hl * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = w + Math.max(2, w * 0.9); path();
  ctx.strokeStyle = '#0e2036'; ctx.fillStyle = '#0e2036'; ctx.lineWidth = w; path();
  ctx.restore();
}

/* Electric vehicle mark (lightning bolt), centred at cx,cy with size sz */
const BOLT = [[0.58, 0], [0.12, 0.56], [0.44, 0.56], [0.34, 1], [0.88, 0.4], [0.56, 0.4], [0.72, 0]];
function drawBolt(ctx, cx, cy, sz) {
  ctx.save(); ctx.beginPath();
  BOLT.forEach(([x, y], i) => { const px = cx + (x - 0.5) * sz, py = cy + (y - 0.5) * sz; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.closePath(); ctx.lineJoin = 'round';
  ctx.fillStyle = '#ffd400'; ctx.fill(); ctx.lineWidth = Math.max(1, sz * 0.09); ctx.strokeStyle = '#0e2036'; ctx.stroke(); ctx.restore();
}
const boltSvg = (cx, cy, sz) => `<polygon points="${BOLT.map(([x, y]) => `${(cx + (x - 0.5) * sz).toFixed(1)},${(cy + (y - 0.5) * sz).toFixed(1)}`).join(' ')}" fill="#ffd400" stroke="#0e2036" stroke-width="${(sz * 0.09).toFixed(1)}" stroke-linejoin="round"/>`;
const BOLT_ICON = `<svg viewBox="0 0 24 24" class="bolt">${boltSvg(12, 12, 22)}</svg>`;

/* ---------- Ship tab ---------- */
function tabShip() {
  const sh = ship(), rows = cargoRows(sh), tot = sumRows(rows);
  const byPod = {}; rows.forEach(r => { (byPod[r.pod] ||= { units: 0, pkgs: 0 }); byPod[r.pod].units += r.units; byPod[r.pod].pkgs += r.pkgs; });
  return `
  <label class="fld inline"><span>Loading now at</span><select data-bind="activePol"><option value="">Select port</option>${portOpts(loadPorts(), sh.activePol)}</select></label>
  <div class="schem-wrap"><canvas id="schem" aria-label="Ship schematic. Tap a hold to open it."></canvas></div>
  <p class="hint">Tap a hold to load (paint) or discharge (erase). Aft is left, bow is right.</p>
  <div class="legend">${dischPorts().map(p => `<span class="lg"><i style="background:${p.color}"></i><b>${esc(p.code)}</b> ${fmt(byPod[p.id]?.units || 0)} units${byPod[p.id]?.pkgs ? ', ' + fmt(byPod[p.id].pkgs) + ' PKGs' : ''}</span>`).join('') || '<span class="muted">Add discharging ports in the Ports tab.</span>'}</div>
  <div class="totline"><span>On board</span><b>${fmt(tot.units)} units</b><b>${fmt(tot.pkgs)} PKGs</b><b>${fmt(tot.mt, 1)} MT statics</b><b>${evCount(sh)} EV</b></div>`;
}
let schemL = null;
function afterShip() {
  const cv = $('#schem'), w = cv.parentElement.clientWidth, h = Math.round(Math.max(360, w * 0.98));
  const ctx = setupCanvas(cv, w, h); schemL = drawShip(ctx, w, h, ship(), cssTheme());
  cv.onclick = e => {
    const r = cv.getBoundingClientRect(), hit = shipHit(schemL, e.clientX - r.left, e.clientY - r.top);
    if (!hit) return;
    if (hit.deck === 5) { UI.view = 'deck5'; UI.d5.zoom = null; UI.d5.sel = null; }
    else { UI.view = 'hold'; UI.deck = hit.deck; UI.hold = hit.hold; UI.undo = []; }
    render();
  };
}

/* Ship schematic renderer (used on screen and in PDF) */
function shipLayout(W, H) {
  const labelW = Math.round(W * 0.115), head = Math.round(H * 0.045), bow = Math.round(W * 0.055);
  const x0 = labelW, x1 = W - bow - 3, cw = (x1 - x0) / 4, top = head, rh = (H - head - 4) / 12;
  return { W, H, labelW, head, bow, x0, x1, cw, top, rh, bot: top + rh * 12 };
}
function shipHit(L, x, y) {
  if (!L || y < L.top || y > L.bot) return null;
  const deck = DECKS[clamp(Math.floor((y - L.top) / L.rh), 0, 11)];
  let j = Math.floor((x - L.x0) / L.cw);
  if (j < 0) j = 4 - holdsFor(deck)[0]; if (j > 3) j = 3;
  const hold = 4 - j;
  if (deck === 5) return { deck, hold };
  return holdsFor(deck).includes(hold) ? { deck, hold } : null;
}
function pill(ctx, txt, x, y, fs, bg, fg) {
  ctx.font = `700 ${fs}px -apple-system,system-ui,Helvetica,sans-serif`;
  const w = ctx.measureText(txt).width + fs * 0.6, h = fs * 1.25;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 3) : ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + 0.5);
}
function drawShip(ctx, W, H, sh, T) {
  const L = shipLayout(W, H), rows = cargoRows(sh);
  const agg = {}; rows.forEach(r => { const k = r.deck + '-' + r.hold; (agg[k] ||= {}); const a = (agg[k][r.pod] ||= { units: 0, pkgs: 0 }); a.units += r.units; a.pkgs += r.pkgs; });
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  const fsH = Math.max(9, L.rh * 0.34);
  ctx.font = `600 ${fsH}px -apple-system,system-ui,Helvetica,sans-serif`; ctx.fillStyle = T.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (let j = 0; j < 4; j++) ctx.fillText('Hold ' + (4 - j), L.x0 + L.cw * (j + 0.5), L.head - 5);
  // hull
  ctx.beginPath(); ctx.moveTo(L.x0 - 2, L.top); ctx.lineTo(L.x1, L.top);
  ctx.bezierCurveTo(L.x1 + L.bow * 1.5, L.top + (L.bot - L.top) * 0.12, L.x1 + L.bow * 0.9, L.top + (L.bot - L.top) * 0.6, L.x1 - L.cw * 0.12, L.bot);
  ctx.lineTo(L.x0 + L.cw * 0.05, L.bot); ctx.lineTo(L.x0 - 2, L.bot - L.rh * 0.6); ctx.closePath();
  ctx.fillStyle = T.hull; ctx.fill(); ctx.lineWidth = Math.max(1.5, W / 400); ctx.strokeStyle = T.line; ctx.stroke();
  DECKS.forEach((d, i) => {
    const y = L.top + i * L.rh, hs = holdsFor(d);
    const dt = rows.filter(r => r.deck === d).reduce((a, r) => a + r.units, 0);
    ctx.fillStyle = T.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.max(9, L.rh * 0.34)}px -apple-system,system-ui,Helvetica,sans-serif`; ctx.fillText('DK ' + d, L.labelW / 2, y + L.rh * 0.36);
    ctx.font = `500 ${Math.max(8, L.rh * 0.27)}px -apple-system,system-ui,Helvetica,sans-serif`; ctx.fillStyle = T.muted; ctx.fillText(fmt(dt) + ' u', L.labelW / 2, y + L.rh * 0.72);
    for (let j = 0; j < 4; j++) {
      const h = 4 - j, x = L.x0 + j * L.cw;
      if (!hs.includes(h)) {
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, L.cw, L.rh); ctx.clip(); ctx.fillStyle = T.void; ctx.fillRect(x, y, L.cw, L.rh);
        ctx.strokeStyle = T.line; ctx.globalAlpha = 0.25; ctx.lineWidth = 1;
        for (let k = -L.rh; k < L.cw; k += 7) { ctx.beginPath(); ctx.moveTo(x + k, y + L.rh); ctx.lineTo(x + k + L.rh, y); ctx.stroke(); }
        ctx.restore(); continue;
      }
      ctx.fillStyle = T.cell; ctx.fillRect(x, y, L.cw, L.rh);
      if (d !== 5) {
        const ho = sh.holds[d + '-' + h];
        if (ho) {
          const cw = L.cw / GC, ch = L.rh / GR;
          ho.cells.forEach((v, n) => { if (!v) return; const p = sh.ports.find(q => q.id === v); if (!p) return; ctx.fillStyle = p.color || '#ccc'; ctx.fillRect(x + (n % GC) * cw, y + Math.floor(n / GC) * ch, cw + 0.6, ch + 0.6); });
          (ho.arrows || []).forEach(r => drawArrow(ctx, x + r[0] * L.cw, y + r[1] * L.rh, x + r[2] * L.cw, y + r[3] * L.rh, Math.max(1.2, L.rh * 0.05)));
          (ho.evs || []).forEach(v => drawBolt(ctx, x + v[0] * L.cw, y + v[1] * L.rh, Math.max(7, L.rh * 0.32)));
        }
      }
    }
    if (d === 5) {
      const X = v => L.x0 + d5Col(v) * L.cw * 4, Y = v => y + v * L.rh / D5H;
      ctx.save(); ctx.beginPath(); ctx.rect(L.x0, y, L.cw * 4, L.rh); ctx.clip();
      sh.deck5.shapes.forEach(q => {
        if (q.type === 'ev') return;
        const p = sh.ports.find(o => o.id === q.pod); ctx.fillStyle = (p && p.color) || '#cfd8e3'; ctx.strokeStyle = '#1d2b3f'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        if (q.type === 'free') { q.pts.forEach((pt, i) => i ? ctx.lineTo(X(pt[0]), Y(pt[1])) : ctx.moveTo(X(pt[0]), Y(pt[1]))); ctx.closePath(); }
        else ctx.rect(X(q.x), Y(q.y), X(q.x + q.w) - X(q.x), Y(q.y + q.h) - Y(q.y));
        ctx.fill(); ctx.stroke();
      });
      ctx.restore();
      sh.deck5.shapes.filter(q => q.type === 'ev').forEach(q => drawBolt(ctx, X(q.x + q.w / 2), Y(q.y + q.h / 2), Math.max(7, L.rh * 0.32)));
    }
    ctx.strokeStyle = T.line; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
    for (let j = 0; j < 4; j++) if (hs.includes(4 - j)) ctx.strokeRect(L.x0 + j * L.cw + 0.5, y + 0.5, L.cw - 1, L.rh - 1);
    ctx.globalAlpha = 1;
    for (let j = 0; j < 4; j++) {
      const h = 4 - j, a = agg[d + '-' + h]; if (!a || !hs.includes(h)) continue;
      const items = Object.entries(a).filter(([, v]) => v.units || v.pkgs).map(([pod, v]) => `${sh.ports.find(q => q.id === pod)?.code || '?'} ${v.units ? fmt(v.units) : ''}${v.pkgs ? (v.units ? '+' : '') + fmt(v.pkgs) + 'p' : ''}`);
      if (!items.length) continue;
      const fs = Math.max(7.5, Math.min(L.rh * 0.3, L.cw * 0.13)), shown = items.length > 2 ? [items[0], '+' + (items.length - 1) + ' more'] : items;
      shown.forEach((t, k) => pill(ctx, t, L.x0 + L.cw * (j + 0.5), y + L.rh * (shown.length === 1 ? 0.5 : 0.3 + k * 0.4), fs, 'rgba(255,255,255,.9)', '#0e2036'));
    }
    for (let j = 0; j < 4; j++) {
      const h = 4 - j, o = sh.holds[d + '-' + h]; if (!hs.includes(h) || !o || !o.height) continue;
      const hh = HEIGHTS.find(x => x[0] === o.height); if (!hh) continue;
      const fs = Math.max(6.5, Math.min(L.rh * 0.24, L.cw * 0.1));
      ctx.font = `800 ${fs}px -apple-system,system-ui,Helvetica,sans-serif`;
      const tw = ctx.measureText(hh[2]).width + fs * 0.5, bx = L.x0 + (j + 1) * L.cw - tw - 2, by = y + 2;
      ctx.fillStyle = hh[3]; ctx.fillRect(bx, by, tw, fs * 1.2);
      ctx.fillStyle = hh[0] === 'lt18' ? '#0e2036' : '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(hh[2], bx + tw / 2, by + fs * 0.62);
    }
  });
  return L;
}

/* ---------- Ports tab ---------- */
function tabPorts() {
  const sh = ship();
  return `
  <div class="card">
    <div class="grid2">
      <label class="fld"><span>Ship name</span><input data-bind="name" value="${esc(sh.name)}"></label>
      <label class="fld"><span>Voyage no.</span><input data-bind="voyage" value="${esc(sh.voyage)}" autocapitalize="characters"></label>
      <label class="fld"><span>Departure date</span><input type="date" data-bind="depDate" value="${esc(sh.depDate)}"></label>
      <label class="fld"><span>Loading now at</span><select data-bind="activePol"><option value="">Select port</option>${portOpts(loadPorts(), sh.activePol)}</select></label>
    </div>
    <p class="rot" id="rot">${esc(rotation(sh))}</p>
  </div>
  <div class="card">
    <label class="fld"><span>Add port</span><input id="portSearch" placeholder="Start typing a port name or UN/LOCODE" autocomplete="off" autocorrect="off" spellcheck="false"></label>
    <div id="searchRes"></div>
  </div>
  <p class="hint">Tap the number to move a port in the rotation. L = loading, D = discharging, L+D = both.</p>
  <ul class="plist" id="portList">${sh.ports.map(portRow).join('') || '<li class="empty">No ports yet. Search above to add the first one.</li>'}</ul>`;
}
function portRow(p) {
  const open = UI.openPort === p.id;
  return `<li class="prow ${open ? 'open' : ''}" data-id="${p.id}">
    <div class="pmain">
      <label class="pos"><span class="sr">Position in rotation</span><select data-pos="${p.id}">${ship().ports.map((_, i) => `<option value="${i}" ${ship().ports.indexOf(p) === i ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
      <i class="dot ${p.type === 'L' ? 'none' : ''}" style="${p.type !== 'L' ? 'background:' + p.color : ''}"></i>
      <button class="pinfo" data-act="portOpen" data-id="${p.id}"><b>${esc(p.code)}</b><span>${esc(p.name)}</span><small>${esc(p.locode)}</small></button>
      <div class="seg sm">${[['L', 'L'], ['D', 'D'], ['LD', 'L+D']].map(([v, n]) => `<button data-act="ptype" data-id="${p.id}" data-v="${v}" class="${p.type === v ? 'on' : ''}">${n}</button>`).join('')}</div>
      <button class="ic danger" data-act="portDel" data-id="${p.id}" aria-label="Delete ${esc(p.code)}">${I.bin}</button>
    </div>
    ${open ? `<div class="pedit">
      <div class="grid2">
        <label class="fld"><span>Port name</span><input data-pbind="name" data-id="${p.id}" value="${esc(p.name)}"></label>
        <label class="fld"><span>Short code in plan</span><input data-pbind="code" data-id="${p.id}" value="${esc(p.code)}" maxlength="6" autocapitalize="characters"></label>
      </div>
      <label class="fld"><span>Change UN/LOCODE (now ${esc(p.locode)})</span><input data-locfor="${p.id}" placeholder="Type to search" autocomplete="off" autocorrect="off" spellcheck="false"></label>
      <div class="locres" data-locres="${p.id}"></div>
      ${p.type !== 'L' ? `<p class="lbl">Colour</p><div class="pal">${PALETTE.map(([n, c]) => `<button class="sw ${p.color === c ? 'on' : ''}" style="background:${c}" data-act="pcolor" data-id="${p.id}" data-v="${c}" aria-label="${n}"></button>`).join('')}</div>` : ''}
    </div>` : ''}
  </li>`;
}
function afterPorts() {
  const ps = $('#portSearch');
  ps.oninput = async () => { const v = ps.value; const r = await searchLoc(v); if (ps.value === v) $('#searchRes').innerHTML = resultsHtml(r, 'addPort'); };
  $$('[data-locfor]').forEach(inp => inp.oninput = async () => { const v = inp.value; const r = await searchLoc(v); if (inp.value === v) $(`[data-locres="${inp.dataset.locfor}"]`).innerHTML = resultsHtml(r, 'setLoc', `data-id="${inp.dataset.locfor}"`); });
}

/* ---------- Summary tab ---------- */
function tabSummary() {
  const sh = ship(), rows = cargoRows(sh);
  const loadCards = loadPorts().map(p => {
    const mine = rows.filter(r => r.pol === p.id), act = sumRows(mine), st = expStatus(p, act);
    const pods = [...new Set(mine.map(r => r.pod))];
    let badge = '';
    if (st.s === 'ok') badge = `<span class="badge ok">${I.ok} Matches expected</span>`;
    else if (st.s === 'off') { const parts = []; if (st.eu !== null && st.eu !== act.units) parts.push(`${fmt(act.units)} of ${fmt(st.eu)} units`); if (st.ep !== null && st.ep !== act.pkgs) parts.push(`${fmt(act.pkgs)} of ${fmt(st.ep)} PKGs`); badge = `<span class="badge off">${parts.join(', ')}</span>`; }
    return `<div class="card scard ${st.s}">
      <div class="sc-h"><b>${esc(p.name)} (${esc(p.code)})</b>${badge}</div>
      <div class="grid2 exp">
        <label class="fld"><span>Expected units</span><input inputmode="numeric" data-pbind="expUnits" data-id="${p.id}" value="${esc(p.expUnits)}"></label>
        <label class="fld"><span>Expected PKGs</span><input inputmode="numeric" data-pbind="expPkgs" data-id="${p.id}" value="${esc(p.expPkgs)}"></label>
      </div>
      <table class="tbl"><thead><tr><th>POD</th><th>Units</th><th>PKGs</th><th>MT</th></tr></thead><tbody>
      ${pods.map(pod => { const a = sumRows(mine.filter(r => r.pod === pod)); return `<tr><td><i class="dot" style="background:${colorOf(pod)}"></i>${esc(code(pod))}</td><td>${fmt(a.units)}</td><td>${fmt(a.pkgs)}</td><td>${fmt(a.mt, 1)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">Nothing loaded here yet</td></tr>'}
      </tbody><tfoot><tr><td>Total</td><td>${fmt(act.units)}</td><td>${fmt(act.pkgs)}</td><td>${fmt(act.mt, 1)}</td></tr></tfoot></table>
    </div>`;
  }).join('');
  const pods = [...new Set(rows.map(r => r.pod))].sort((a, b) => sh.ports.findIndex(p => p.id === a) - sh.ports.findIndex(p => p.id === b));
  const tot = sumRows(rows);
  return `
  <h2 class="sh">On board by discharge port</h2>
  <div class="card tblwrap"><table class="tbl"><thead><tr><th>POD</th><th>H4</th><th>H3</th><th>H2</th><th>H1</th><th>Units</th><th>PKGs</th><th>MT</th></tr></thead><tbody>
  ${pods.map(pod => { const m = rows.filter(r => r.pod === pod), a = sumRows(m); return `<tr><td><i class="dot" style="background:${colorOf(pod)}"></i>${esc(code(pod))}</td>${[4, 3, 2, 1].map(h => `<td>${fmt(m.filter(r => r.hold === h).reduce((x, r) => x + r.units, 0))}</td>`).join('')}<td><b>${fmt(a.units)}</b></td><td>${fmt(a.pkgs)}</td><td>${fmt(a.mt, 1)}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">No cargo on board</td></tr>'}
  </tbody><tfoot><tr><td>Total</td>${[4, 3, 2, 1].map(h => `<td>${fmt(rows.filter(r => r.hold === h).reduce((x, r) => x + r.units, 0))}</td>`).join('')}<td>${fmt(tot.units)}</td><td>${fmt(tot.pkgs)}</td><td>${fmt(tot.mt, 1)}</td></tr></tfoot></table></div>
  <p class="hint">PKGs: packages on loaded MAFIs. An empty MAFI or empty MAFI stack counts as 1 PKG. MT: package weight plus MAFI tare.</p>
  <h2 class="sh">Loaded at each port</h2>
  ${loadCards || '<p class="muted">Mark ports as L or L+D in the Ports tab.</p>'}`;
}

/* ---------- MAFIs tab ---------- */
function tabMafis() {
  const list = mafiList();
  if (!list.length) return `<div class="empty-state"><p>No MAFIs on Deck 5 yet.</p><button class="btn primary" data-act="openD5">Open Deck 5</button></div>`;
  return `<button class="btn" data-act="openD5">Open Deck 5</button>
  ${[4, 3, 2, 1].map(h => { const m = list.filter(x => x.hold === h); if (!m.length) return ''; return `<h2 class="sh">Hold ${h}</h2><div class="card tblwrap"><table class="tbl mafi"><thead><tr><th>POD/POL</th><th>MAFI No.</th><th>Stack</th><th>Loaded</th><th>PKGs</th><th>MT</th><th>Tara</th></tr></thead><tbody>
    ${m.map(x => `<tr data-act="openMafi" data-id="${x.id}"><td><i class="dot" style="background:${x.color}"></i>${esc(x.podpol)}</td><td>${esc(x.no || '–')}</td><td>${esc(x.stack)}</td><td>${x.loaded ? 'Yes' : 'No'}</td><td>${fmt(x.pkgs)}</td><td>${fmt(x.mt, 1)}</td><td>${fmt(x.tara, 1)}</td></tr>`).join('')}
    </tbody></table></div>`; }).join('')}`;
}

/* ---------- Export tab ---------- */
function tabExport() {
  const sh = ship();
  return `
  <div class="card">
    <h2 class="ch">PDF report</h2>
    <p class="muted">Stowage plan, stowage detail, summary, Deck 5 plan and MAFI list.</p>
    <label class="fld"><span>Send to</span><input type="email" data-bind="email" value="${esc(sh.email)}"></label>
    <button class="btn primary big" data-act="makePdf">Create PDF</button>
    ${UI.pdf ? `<div class="pdfready">
      <p><b>${esc(UI.pdf.name)}</b> is ready.</p>
      <button class="btn primary" data-act="sharePdf">Email PDF</button>
      <button class="btn" data-act="savePdf">Save to Files</button>
      <p class="hint">Email PDF opens the share menu. Choose Mail. The address ${esc(sh.email)} is copied, so paste it into the To field. Without signal, the email waits in your Outbox.</p>
    </div>` : ''}
  </div>
  <div class="card">
    <h2 class="ch">Backup</h2>
    <p class="muted">Keep a copy in case the iPhone's storage is cleared.</p>
    <button class="btn" data-act="backup">Save backup file</button>
    <label class="btn filebtn">Restore from backup<input type="file" accept=".json,application/json" id="restore" hidden></label>
  </div>
  <div class="card">
    <h2 class="ch">New voyage</h2>
    <p class="muted">Removes all cargo, MAFIs, EV marks, arrows, unit heights and all ports for ${esc(sh.name)}.</p>
    <button class="btn danger" data-act="newVoyage">Clear cargo and ports for new voyage</button>
  </div>`;
}

/* =========================================================
   HOLD EDITOR
   ========================================================= */
function bottomNav() {
  const d = UI.view === 'deck5' ? 5 : UI.deck, hs = holdsFor(d);
  return `<nav class="bnav">
    <div class="brow"><span class="blbl">Hold</span>${[4, 3, 2, 1].map(h => { const on = UI.view === 'hold' ? UI.hold === h : UI.d5.zoom === h; return `<button class="bchip ${on ? 'on' : ''}" data-act="navHold" data-v="${h}" ${hs.includes(h) ? '' : 'disabled'}>${h}</button>`; }).join('')}${d === 5 ? `<button class="bchip wide ${UI.d5.zoom == null ? 'on' : ''}" data-act="navHold" data-v="all">All</button>` : ''}</div>
    <div class="brow"><span class="blbl">Deck</span><div class="dscroll">${DECKS.map(x => `<button class="bchip ${x === d ? 'on' : ''}" data-act="navDeck" data-v="${x}">${x}</button>`).join('')}</div></div>
  </nav>`;
}
function renderHold() {
  const sh = ship(), d = UI.deck, h = UI.hold, ho = getHold(d, h, true);
  if (!UI.pod || !P(UI.pod) || P(UI.pod).type === 'L') UI.pod = dischPorts()[0]?.id || null;
  app.innerHTML = `
  <header class="top">
    <button class="ic" data-act="toShip" aria-label="Back to ship">${I.back}</button>
    <div class="ttl"><b>Deck ${d}, Hold ${h}</b><span>${sh.activePol ? 'Loading at ' + esc(code(sh.activePol)) : 'Set the loading port in Ports'}${ho.evs.length ? `, ${ho.evs.length} EV` : ''}</span></div>
    <button class="ic" data-act="undo" id="undoBtn" aria-label="Undo" ${UI.undo.length ? '' : 'disabled'}>${I.undo}</button>
  </header>
  <main class="hold-main">
    ${heightSelect(d, h)}
    <div class="seg wide">
      <button data-act="mode" data-v="paint" class="${UI.mode === 'paint' ? 'on' : ''}">Load</button>
      <button data-act="mode" data-v="erase" class="${UI.mode === 'erase' ? 'on erase' : ''}">Discharge</button>
      <button data-act="mode" data-v="arrow" class="${UI.mode === 'arrow' ? 'on' : ''}">Arrow</button>
      <button data-act="mode" data-v="ev" class="${UI.mode === 'ev' ? 'on' : ''}">EV</button>
    </div>
    ${UI.mode === 'ev' ? `<div class="ev-bar"><span class="ev-drag" id="evDrag" aria-label="Drag EV mark onto the hold">${BOLT_ICON}</span><p>Drag the bolt onto the exact spot, or tap the hold. Drag a bolt to move it, tap it to remove it.</p></div>` : UI.mode === 'arrow' ? `<p class="arrow-hint">Drag to draw a stowage direction arrow. Tap an arrow to remove it.</p>` : `<div class="chips ${UI.mode === 'erase' ? 'dim' : ''}">${dischPorts().map(p => `<button class="chip ${UI.pod === p.id ? 'on' : ''}" data-act="pickPod" data-v="${p.id}" style="--c:${p.color};--t:${textOn(p.color)}">${esc(p.code)}</button>`).join('') || '<span class="muted">Add discharging ports first.</span>'}</div>`}
    <div class="gridwrap"><div class="axis"><span>Aft</span><span>Hold ${h}</span><span>Fwd</span></div><canvas id="hgrid"></canvas></div>
    <div class="row-btns">${UI.mode === 'ev' ? `<button class="btn sm" data-act="clearEvs" ${ho.evs.length ? '' : 'disabled'}>Remove all EV marks (${ho.evs.length})</button>` : UI.mode === 'arrow' ? `<button class="btn sm" data-act="clearArrows" ${ho.arrows.length ? '' : 'disabled'}>Remove all arrows (${ho.arrows.length})</button>` : `<button class="btn sm" data-act="fillHold">Fill with ${esc(code(UI.pod))}</button><button class="btn sm" data-act="clearHold">Clear hold</button>`}</div>
    <div class="sec-h"><h2>Units in this hold</h2><b id="holdTot">${fmt(ho.entries.reduce((a, e) => a + num(e.units), 0))}</b></div>
    <div id="entries">${entriesHtml(ho)}</div>
    <button class="btn" data-act="addEntry">${I.plus} Add units</button>
  </main>
  ${bottomNav()}`;
  drawHoldGrid(); bindGrid();
}
function entriesHtml(ho) {
  if (!ho.entries.length) return '<p class="muted">Paint the hold, then enter units and brand here.</p>';
  return ho.entries.map(e => `<div class="entry" data-id="${e.id}">
    <i class="dot" style="background:${colorOf(e.pod)}"></i>
    <select data-ebind="pod" aria-label="POD">${portOpts(dischPorts(), e.pod)}</select>
    <select data-ebind="pol" aria-label="POL"><option value="">POL</option>${portOpts(loadPorts(), e.pol)}</select>
    <input data-ebind="units" inputmode="numeric" placeholder="Units" value="${esc(e.units)}" aria-label="Units">
    <input data-ebind="brand" placeholder="Brand / model" value="${esc(e.brand)}" aria-label="Brand">
    <button class="ic danger" data-act="delEntry" data-id="${e.id}" aria-label="Remove">${I.bin}</button>
  </div>`).join('');
}
function refreshHoldMeta() {
  const ho = getHold(UI.deck, UI.hold, true);
  const u = $('#undoBtn'); if (u) u.disabled = !UI.undo.length;
  const t = $('#holdTot'); if (t) t.textContent = fmt(ho.entries.reduce((a, e) => a + num(e.units), 0));
}
function drawHoldGrid() {
  const cv = $('#hgrid'); if (!cv) return;
  const w = cv.parentElement.clientWidth, h = Math.round(w * GR / GC);
  const ctx = setupCanvas(cv, w, h), T = cssTheme(), ho = getHold(UI.deck, UI.hold, true), cw = w / GC, ch = h / GR;
  ctx.fillStyle = T.cell; ctx.fillRect(0, 0, w, h);
  ho.cells.forEach((v, n) => { if (!v) return; ctx.fillStyle = colorOf(v); ctx.fillRect((n % GC) * cw, Math.floor(n / GC) * ch, cw + 0.5, ch + 0.5); });
  ctx.strokeStyle = T.line; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
  for (let i = 1; i < GC; i++) { ctx.beginPath(); ctx.moveTo(Math.round(i * cw) + 0.5, 0); ctx.lineTo(Math.round(i * cw) + 0.5, h); ctx.stroke(); }
  for (let i = 1; i < GR; i++) { ctx.beginPath(); ctx.moveTo(0, Math.round(i * ch) + 0.5); ctx.lineTo(w, Math.round(i * ch) + 0.5); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2);
  const aw = Math.max(3, w / 110);
  ho.arrows.forEach(r => drawArrow(ctx, r[0] * w, r[1] * h, r[2] * w, r[3] * h, aw));
  const bs = Math.max(18, w / GC * 1.1);
  ho.evs.forEach(v => drawBolt(ctx, v[0] * w, v[1] * h, bs));
  if (UI.evTmp) { ctx.globalAlpha = 0.55; drawBolt(ctx, UI.evTmp[0] * w, UI.evTmp[1] * h, bs); ctx.globalAlpha = 1; }
  if (UI.arrowTmp) { const r = UI.arrowTmp; ctx.globalAlpha = 0.6; drawArrow(ctx, r[0] * w, r[1] * h, r[2] * w, r[3] * h, aw); ctx.globalAlpha = 1; }
}
function pushUndo() { const ho = getHold(UI.deck, UI.hold, true); UI.undo.push({ cells: ho.cells.slice(), arrows: ho.arrows.map(a => a.slice()), evs: ho.evs.map(a => a.slice()) }); if (UI.undo.length > 40) UI.undo.shift(); }
function bindGrid() {
  const cv = $('#hgrid'); if (!cv) return;
  let painting = false, last = null;
  const ho = getHold(UI.deck, UI.hold, true);
  const at = e => { const r = cv.getBoundingClientRect(); return { x: clamp(Math.floor((e.clientX - r.left) / r.width * GC), 0, GC - 1), y: clamp(Math.floor((e.clientY - r.top) / r.height * GR), 0, GR - 1) }; };
  const apply = c => { ho.cells[c.y * GC + c.x] = UI.mode === 'paint' ? UI.pod : null; };
  const line = (a, b) => { const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) || 1; const out = []; for (let i = 0; i <= n; i++) out.push({ x: Math.round(a.x + (b.x - a.x) * i / n), y: Math.round(a.y + (b.y - a.y) * i / n) }); return out; };
  const frac = e => { const r = cv.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
  let arrowStart = null;
  const arrowMode = () => UI.mode === 'arrow';
  cv.addEventListener('pointerdown', e => {
    if (!arrowMode()) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); arrowStart = frac(e); UI.arrowTmp = null;
  });
  cv.addEventListener('pointermove', e => {
    if (!arrowMode() || !arrowStart) return; const p = frac(e); UI.arrowTmp = [arrowStart[0], arrowStart[1], p[0], p[1]]; drawHoldGrid();
  });
  const arrowEnd = e => {
    if (!arrowMode() || !arrowStart) return;
    const p = frac(e), r = cv.getBoundingClientRect(), s0 = arrowStart; arrowStart = null; UI.arrowTmp = null;
    const lenPx = Math.hypot((p[0] - s0[0]) * r.width, (p[1] - s0[1]) * r.height);
    if (lenPx < 14) {
      // tap: remove the nearest arrow within reach
      const px = s0[0] * r.width, py = s0[1] * r.height; let best = -1, bd = 22;
      ho.arrows.forEach((a, i) => {
        const ax = a[0] * r.width, ay = a[1] * r.height, bx = a[2] * r.width, by = a[3] * r.height, dx = bx - ax, dy = by - ay;
        const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1), d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) { pushUndo(); ho.arrows.splice(best, 1); save(); toast('Arrow removed.'); rerender(); } else drawHoldGrid();
      return;
    }
    pushUndo(); ho.arrows.push([s0[0], s0[1], p[0], p[1]]); save(); rerender();
  };
  cv.addEventListener('pointerup', arrowEnd); cv.addEventListener('pointercancel', arrowEnd);
  // EV marks: tap to add, drag to move, tap a mark to remove
  const evMode = () => UI.mode === 'ev';
  let evDrag = null;
  const nearEv = (p, r) => { let best = -1, bd = 20; ho.evs.forEach((v, i) => { const d = Math.hypot((v[0] - p[0]) * r.width, (v[1] - p[1]) * r.height); if (d < bd) { bd = d; best = i; } }); return best; };
  cv.addEventListener('pointerdown', e => {
    if (!evMode()) return; e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const p = frac(e), r = cv.getBoundingClientRect(), i = nearEv(p, r);
    evDrag = { i, start: p, moved: false };
  });
  cv.addEventListener('pointermove', e => {
    if (!evMode() || !evDrag || evDrag.i < 0) return;
    const p = frac(e), r = cv.getBoundingClientRect();
    if (!evDrag.moved && Math.hypot((p[0] - evDrag.start[0]) * r.width, (p[1] - evDrag.start[1]) * r.height) > 6) { evDrag.moved = true; pushUndo(); }
    if (evDrag.moved) { ho.evs[evDrag.i] = p; drawHoldGrid(); }
  });
  const evEnd = e => {
    if (!evMode() || !evDrag) return; const d = evDrag; evDrag = null;
    if (d.i >= 0 && d.moved) { save(); return; }
    pushUndo();
    if (d.i >= 0) { ho.evs.splice(d.i, 1); toast('EV mark removed. Undo restores it.'); }
    else ho.evs.push(d.start);
    save(); rerender();
  };
  cv.addEventListener('pointerup', evEnd); cv.addEventListener('pointercancel', evEnd);
  // drag the bolt from the bar onto the hold
  const src = $('#evDrag');
  if (src) {
    let ghost = null;
    const over = e => { const r = cv.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
    src.onpointerdown = e => { e.preventDefault(); src.setPointerCapture(e.pointerId); ghost = document.createElement('div'); ghost.className = 'ev-ghost'; ghost.innerHTML = BOLT_ICON; document.body.append(ghost); src.onpointermove(e); };
    src.onpointermove = e => { if (!ghost) return; ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; UI.evTmp = over(e) ? frac(e) : null; drawHoldGrid(); };
    src.onpointerup = src.onpointercancel = e => {
      if (!ghost) return; ghost.remove(); ghost = null; UI.evTmp = null;
      if (e.type === 'pointerup' && over(e)) { pushUndo(); ho.evs.push(frac(e)); save(); rerender(); } else drawHoldGrid();
    };
  }
  cv.onpointerdown = e => {
    if (arrowMode() || evMode()) return;
    if (UI.mode === 'paint' && !UI.pod) { toast('Add a discharging port in the Ports tab first.'); return; }
    e.preventDefault(); cv.setPointerCapture(e.pointerId); painting = true; pushUndo(); last = at(e); apply(last); drawHoldGrid();
  };
  cv.onpointermove = e => { if (!painting || arrowMode() || evMode()) return; const c = at(e); line(last, c).forEach(apply); last = c; drawHoldGrid(); };
  cv.onpointerup = cv.onpointercancel = () => { if (!painting) return; painting = false; afterStroke(UI.mode); };
}
function afterStroke(mode) {
  const sh = ship(), ho = getHold(UI.deck, UI.hold, true), present = new Set(ho.cells.filter(Boolean));
  save(); refreshHoldMeta();
  if (mode === 'paint') {
    let added = false;
    present.forEach(pod => { if (!ho.entries.some(e => e.pod === pod)) { ho.entries.push({ id: uid(), pod, pol: sh.activePol || '', units: '', brand: '' }); added = true; } });
    if (added) { $('#entries').innerHTML = entriesHtml(ho); save(); toast('Enter the number of units below.'); }
  } else {
    const orphan = [...new Set(ho.entries.map(e => e.pod))].filter(p => !present.has(p));
    if (orphan.length) {
      const names = orphan.map(code).join(', ');
      confirmBox(`No ${names} colour is left in this hold. Remove the ${names} units from this hold too?`, 'Remove units').then(ok => {
        if (!ok) return; ho.entries = ho.entries.filter(e => !orphan.includes(e.pod)); save(); $('#entries').innerHTML = entriesHtml(ho); refreshHoldMeta();
      });
    }
  }
}

/* =========================================================
   DECK 5 EDITOR
   ========================================================= */
const D5TOOLS = [['select', 'Select'], ['rect', 'Rectangle'], ['free', 'Draw'], ['mafi', 'MAFI'], ['ev', 'EV']];
function renderDeck5() {
  const sh = ship();
  if (!UI.pod || !P(UI.pod) || P(UI.pod).type === 'L') UI.pod = dischPorts()[0]?.id || null;
  app.innerHTML = `
  <header class="top">
    <button class="ic" data-act="toShip" aria-label="Back to ship">${I.back}</button>
    <div class="ttl"><b>Deck 5, main deck</b><span>${UI.d5.zoom ? 'Hold ' + UI.d5.zoom : 'All holds'}${sh.activePol ? ', loading at ' + esc(code(sh.activePol)) : ''}</span></div>
    <button class="ic danger" data-act="d5Del" id="d5Del" aria-label="Delete selected" ${UI.d5.sel ? '' : 'disabled'}>${I.bin}</button>
  </header>
  <p class="rotate-hint">Turn your iPhone sideways for a larger Deck 5.</p>
  <div class="d5-tools" id="d5Tools">${d5ToolsHtml()}</div>
  ${UI.d5.zoom ? `<div class="d5-height">${heightSelect(5, UI.d5.zoom)}</div>` : ''}
  <div class="d5-wrap"><svg id="d5" xmlns="http://www.w3.org/2000/svg"></svg></div>
  <p class="hint d5-hint" id="d5Hint">${d5Hint()}</p>
  ${bottomNav()}`;
  drawD5(); bindD5();
}
function d5ToolsHtml() {
  return `<div class="seg zoom"><button data-act="d5zoom" data-v="out" aria-label="Zoom out">−</button><button data-act="d5zoom" data-v="in" aria-label="Zoom in">+</button><button data-act="d5zoom" data-v="fit">Fit</button></div>
  <div class="seg">${D5TOOLS.map(([k, n]) => `<button data-act="d5tool" data-v="${k}" class="${UI.d5.tool === k ? 'on' : ''}">${n}</button>`).join('')}</div>
  <div class="chips">${dischPorts().map(p => `<button class="chip ${UI.pod === p.id ? 'on' : ''}" data-act="pickPod" data-v="${p.id}" style="--c:${p.color};--t:${textOn(p.color)}">${esc(p.code)}</button>`).join('')}</div>`;
}
function d5Hint() {
  return ({ select: 'Pinch with two fingers to zoom, drag the empty deck to pan. Tap an item to edit, drag to move, drag the round handle to resize.', rect: 'Drag on the deck to draw a rectangle for units.', free: 'Draw a free shape with your finger.', mafi: 'Tap on the deck where the MAFI stands.', ev: 'Tap the exact spot of each electric vehicle. Use Select to move or delete.' })[UI.d5.tool];
}
function labelLines(s) {
  const pp = `${s.pod ? code(s.pod) : '?'}/${s.pol ? code(s.pol) : '?'}`;
  if (s.type === 'mafi') {
    const allEmpty = s.mafis.every(m => !m.loaded);
    const l = [pp, s.mafis.length > 1 ? `MAFI STACK x${s.mafis.length}` : `MAFI ${s.mafis[0].no || ''}`.trim()];
    if (allEmpty) l.push('EMPTY'); else { const t = mafiTotals(s); l.push(`${fmt(t.pkgs)} PKGs`); }
    return l;
  }
  const l = [pp]; if (num(s.units)) l.push(fmt(num(s.units)) + ' Uts'); if (s.label) l.push(s.label);
  return l;
}
function wrapLines(lines, w, fs) {
  const max = Math.max(4, Math.floor(w / (fs * 0.56))); const out = [];
  lines.forEach(t => { const words = String(t).split(/\s+/); let cur = ''; words.forEach(wd => { if ((cur + ' ' + wd).trim().length > max && cur) { out.push(cur); cur = wd; } else cur = (cur + ' ' + wd).trim(); }); if (cur) out.push(cur); });
  return out;
}
function fitLabel(s) {
  const b = bbox(s), raw = labelLines(s); let fs = 14, lines;
  let fit = false;
  for (; fs >= 3; fs -= 0.5) { lines = wrapLines(raw, b.w - Math.min(6, b.w * 0.1), fs); if (lines.length * fs * 1.15 <= b.h - Math.min(4, b.h * 0.1)) { fit = true; break; } }
  if (!fit) { // very small object: keep it readable on one line inside the box
    const t = raw.length > 1 && raw[raw.length - 1] !== raw[0] ? raw[0] + ' ' + raw.slice(1).join(' ') : raw[0];
    lines = [t]; fs = Math.max(0.8, Math.min(b.h * 0.75, b.w / (t.length * 0.6)));
    if (fs < 2.5) { lines = [raw[0]]; fs = Math.max(0.8, Math.min(b.h * 0.75, b.w / (raw[0].length * 0.6))); }
  }
  return { b, fs, lines };
}
function shapeSvg(s) {
  if (s.type === 'ev') {
    const sel = UI.d5.sel === s.id;
    return `<g data-id="${s.id}"><rect x="${s.x - 4}" y="${s.y - 4}" width="${s.w + 8}" height="${s.h + 8}" fill="transparent"/>${boltSvg(s.x + s.w / 2, s.y + s.h / 2, s.w)}${sel ? `<rect x="${s.x - 4}" y="${s.y - 4}" width="${s.w + 8}" height="${s.h + 8}" fill="none" class="selbox"/>` : ''}</g>`;
  }
  const c = colorOf(s.pod), tc = textOn(c), sel = UI.d5.sel === s.id, { b, fs, lines } = fitLabel(s);
  const body = s.type === 'free'
    ? `<path d="M${s.pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L')}Z" fill="${c}" fill-opacity=".8" stroke="#1d2b3f" stroke-width="1.3" stroke-linejoin="round"/>`
    : `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2" fill="${c}" stroke="#1d2b3f" stroke-width="${s.type === 'mafi' ? 2.6 : 1.3}" ${s.type === 'mafi' && s.mafis.every(m => !m.loaded) ? 'stroke-dasharray="6 3"' : ''}/>`;
  const y0 = b.y + b.h / 2 - (lines.length - 1) * fs * 1.15 / 2;
  const txt = `<text font-size="${fs}" fill="${tc}" text-anchor="middle" font-weight="700">${lines.map((l, i) => `<tspan x="${b.x + b.w / 2}" y="${y0 + i * fs * 1.15}" dominant-baseline="middle">${esc(l)}</tspan>`).join('')}</text>`;
  const u = d5UnitsPerPx(), pad = 3 * u;
  const selBox = sel ? `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.w + 2 * pad}" height="${b.h + 2 * pad}" fill="none" class="selbox"/>${s.type !== 'free' ? `<circle cx="${b.x + b.w}" cy="${b.y + b.h}" r="${20 * u}" fill="transparent" data-hdl="1"/><circle cx="${b.x + b.w}" cy="${b.y + b.h}" r="${8 * u}" class="hdl" data-hdl="1"/>` : ''}` : '';
  return `<g data-id="${s.id}">${body}${txt}${selBox}</g>`;
}
function d5VB() {
  if (UI.d5.vb) return UI.d5.vb;
  const z = D5HOLDS.find(x => x.h === UI.d5.zoom);
  return z ? { x: z.x0 - 10, y: 0, w: z.x1 - z.x0 + 20, h: D5H } : { x: 0, y: 0, w: D5W, h: D5H };
}
function d5UnitsPerPx() { const svg = $('#d5'); const w = svg && svg.clientWidth; return w ? Math.max(d5VB().w / w, d5VB().h / (svg.clientHeight || 1)) : 1; }
function clampVB(v) {
  const r = { ...v };
  if (r.w >= D5W) r.x = (D5W - r.w) / 2; else r.x = clamp(r.x, 0, D5W - r.w);
  if (r.h >= D5H) r.y = (D5H - r.h) / 2; else r.y = clamp(r.y, 0, D5H - r.h);
  return r;
}
function applyVB(v) { UI.d5.vb = v; const svg = $('#d5'); if (svg) svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); }
function zoomAt(factor, cx, cy) { // cx, cy in deck units
  const v = d5VB(), maxW = Math.min(D5W, D5H * v.w / v.h) * (v.w >= D5W ? 1 : 1);
  const w = clamp(v.w * factor, 40, Math.max(maxW, 40)), h = w * v.h / v.w;
  applyVB(clampVB({ x: cx - (cx - v.x) * w / v.w, y: cy - (cy - v.y) * h / v.h, w, h }));
  drawD5();
}
function drawD5() {
  const svg = $('#d5'); if (!svg) return;
  const v = d5VB(); svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  svg.innerHTML = `
    <image href="deck5.png" x="0" y="0" width="${D5W}" height="${D5H}" preserveAspectRatio="none"/>
    ${ship().deck5.shapes.map(shapeSvg).join('')}
    <g id="tmp"></g>`;
  const del = $('#d5Del'); if (del) del.disabled = !UI.d5.sel;
}
function svgPt(e) {
  const svg = $('#d5'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse()); return [clamp(p.x, 0, D5W), clamp(p.y, 0, D5H)];
}
function clientToD5(x, y) { const svg = $('#d5'), pt = svg.createSVGPoint(); pt.x = x; pt.y = y; const p = pt.matrixTransform(svg.getScreenCTM().inverse()); return [p.x, p.y]; }
function setTool(t) { UI.d5.tool = t; $('#d5Tools').innerHTML = d5ToolsHtml(); $('#d5Hint').textContent = d5Hint(); }
function bindD5() {
  const svg = $('#d5'), sh = ship(); let drag = null, pinch = null, blocked = false;
  const touches = new Map();
  const shape = id => sh.deck5.shapes.find(s => s.id === id);
  const k = () => d5VB().w / D5W;                  // 1 = full deck, smaller = zoomed in
  const cancelDrag = () => {
    if (!drag) return;
    if (drag.k === 'move' && drag.moved) Object.assign(drag.s, drag.o);
    if (drag.k === 'resize') { drag.s.w = drag.w; drag.s.h = drag.h; }
    drag = null; const t = $('#tmp'); if (t) t.innerHTML = ''; drawD5();
  };
  svg.onpointerdown = e => {
    e.preventDefault(); svg.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2) {           // second finger: start pinch zoom
      cancelDrag();
      const [a, b] = [...touches.values()], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      pinch = { d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, vb0: { ...d5VB() }, anchor: clientToD5(mid[0], mid[1]) };
      return;
    }
    if (touches.size > 2 || blocked) return;
    const p = svgPt(e), t = UI.d5.tool;
    if ((t === 'rect' || t === 'free' || t === 'mafi') && !UI.pod) { toast('Add a discharging port in the Ports tab first.'); return; }
    if (t === 'ev' || t === 'mafi') drag = { k: 'place', a: p, c: [e.clientX, e.clientY] };
    else if (t === 'rect') drag = { k: 'new', a: p, b: p };
    else if (t === 'free') drag = { k: 'free', pts: [p] };
    else {
      const hdl = e.target.closest('[data-hdl]'), g = e.target.closest('[data-id]');
      if (hdl && UI.d5.sel && shape(UI.d5.sel) && shape(UI.d5.sel).type !== 'ev') { const s = shape(UI.d5.sel); drag = { k: 'resize', s, a: p, w: s.w, h: s.h }; }
      else if (g) { const s = shape(g.dataset.id); UI.d5.sel = s.id; drag = { k: 'move', s, a: p, o: JSON.parse(JSON.stringify(s)), moved: false }; drawD5(); }
      else drag = { k: 'pan', c: [e.clientX, e.clientY], vb0: { ...d5VB() }, upp: 1 / svg.getScreenCTM().a, moved: false };
    }
  };
  svg.onpointermove = e => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && touches.size >= 2) {
      const [a, b] = [...touches.values()], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const v0 = pinch.vb0, maxW = Math.min(D5W, D5H * v0.w / v0.h);
      const w = clamp(v0.w * pinch.d0 / (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1), 40, Math.max(maxW, 40)), h = w * v0.h / v0.w;
      applyVB({ x: v0.x, y: v0.y, w, h });
      const q = clientToD5(mid[0], mid[1]);
      applyVB(clampVB({ x: v0.x + pinch.anchor[0] - q[0], y: v0.y + pinch.anchor[1] - q[1], w, h }));
      return;
    }
    if (!drag || blocked) return; const p = svgPt(e), tmp = $('#tmp');
    if (drag.k === 'pan') {
      const dx = (e.clientX - drag.c[0]) * drag.upp, dy = (e.clientY - drag.c[1]) * drag.upp;
      if (Math.hypot(e.clientX - drag.c[0], e.clientY - drag.c[1]) > 4) drag.moved = true;
      if (drag.moved) applyVB(clampVB({ ...drag.vb0, x: drag.vb0.x - dx, y: drag.vb0.y - dy }));
    }
    else if (drag.k === 'place') { if (Math.hypot(e.clientX - drag.c[0], e.clientY - drag.c[1]) > 10) drag.moved = true; }
    else if (drag.k === 'new') { drag.b = p; const x = Math.min(drag.a[0], p[0]), y = Math.min(drag.a[1], p[1]); tmp.innerHTML = `<rect x="${x}" y="${y}" width="${Math.abs(p[0] - drag.a[0])}" height="${Math.abs(p[1] - drag.a[1])}" fill="${colorOf(UI.pod)}" fill-opacity=".6" class="selbox"/>`; }
    else if (drag.k === 'free') { const l = drag.pts[drag.pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 3 * k()) drag.pts.push(p); tmp.innerHTML = `<path d="M${drag.pts.map(q => q.join(',')).join('L')}" fill="${colorOf(UI.pod)}" fill-opacity=".5" class="selbox"/>`; }
    else if (drag.k === 'move') {
      const dx = p[0] - drag.a[0], dy = p[1] - drag.a[1]; if (Math.hypot(dx, dy) > 3 * k()) drag.moved = true; if (!drag.moved) return;
      const s = drag.s, o = drag.o;
      if (s.type === 'free') s.pts = o.pts.map(q => [clamp(q[0] + dx, 0, D5W), clamp(q[1] + dy, 0, D5H)]);
      else { s.x = clamp(o.x + dx, 0, D5W - s.w); s.y = clamp(o.y + dy, 0, D5H - s.h); }
      drawD5();
    } else if (drag.k === 'resize') { const s = drag.s; s.w = clamp(drag.w + p[0] - drag.a[0], 4, D5W - s.x); s.h = clamp(drag.h + p[1] - drag.a[1], 3, D5H - s.y); drawD5(); }
  };
  svg.onpointerup = svg.onpointercancel = e => {
    touches.delete(e.pointerId);
    if (pinch) { if (touches.size < 2) { pinch = null; blocked = touches.size > 0; drawD5(); } return; }
    if (blocked) { if (!touches.size) blocked = false; return; }
    if (!drag) return; const d = drag; drag = null;
    if (e.type === 'pointercancel') { const t = $('#tmp'); if (t) t.innerHTML = ''; return; }
    if (d.k === 'pan') { if (!d.moved) { UI.d5.sel = null; drawD5(); } }
    else if (d.k === 'place' && !d.moved) {
      const p = d.a;
      if (UI.d5.tool === 'ev') {
        const s = { id: uid(), type: 'ev', x: clamp(p[0] - 13, 0, D5W - 26), y: clamp(p[1] - 13, 0, D5H - 26), w: 26, h: 26 };
        sh.deck5.shapes.push(s); UI.d5.sel = s.id; save(); drawD5();
      } else {
        const s = { id: uid(), type: 'mafi', x: clamp(p[0] - 40, 0, D5W - 80), y: clamp(p[1] - 18, 0, D5H - 36), w: 80, h: 36, pod: UI.pod, pol: sh.activePol || '', mafis: [{ no: '', loaded: true, pkgs: '', mt: '', tara: '' }] };
        sh.deck5.shapes.push(s); UI.d5.sel = s.id; save(); drawD5(); setTool('select'); openSheet(s);
      }
    }
    else if (d.k === 'new') {
      const x = Math.min(d.a[0], d.b[0]), y = Math.min(d.a[1], d.b[1]), w = Math.abs(d.b[0] - d.a[0]), h = Math.abs(d.b[1] - d.a[1]);
      $('#tmp').innerHTML = '';
      if (w < 12 * k() || h < 8 * k()) { toast('Drag to draw a bigger rectangle, or zoom in for small objects.'); return; }
      const s = { id: uid(), type: 'rect', x, y, w, h, pod: UI.pod, pol: sh.activePol || '', units: '', label: '' };
      sh.deck5.shapes.push(s); UI.d5.sel = s.id; save(); drawD5(); setTool('select'); openSheet(s);
    } else if (d.k === 'free') {
      $('#tmp').innerHTML = '';
      if (d.pts.length < 4) return;
      const s = { id: uid(), type: 'free', pts: d.pts.filter((q, i) => i % 2 === 0 || i === d.pts.length - 1), pod: UI.pod, pol: sh.activePol || '', units: '', label: '' };
      sh.deck5.shapes.push(s); UI.d5.sel = s.id; save(); drawD5(); setTool('select'); openSheet(s);
    } else if (d.k === 'move') { if (!d.moved) openSheet(d.s); else save(); }
    else if (d.k === 'resize') save();
  };
}
function sheetBody(s) {
  const hold = shapeHold(s);
  if (s.type === 'ev') return `<p>Electric vehicle mark in Hold ${hold}. Drag it on the deck to move it.</p>`;
  const top = `<div class="grid2">
      <label class="fld"><span>POD</span><select data-sb="pod">${portOpts(dischPorts(), s.pod)}</select></label>
      <label class="fld"><span>POL</span><select data-sb="pol"><option value="">Select</option>${portOpts(loadPorts(), s.pol)}</select></label>
    </div><p class="muted">In Hold ${hold} (set by position on deck)</p>`;
  if (s.type !== 'mafi') return top + `
    <label class="fld"><span>Units</span><input data-sb="units" inputmode="numeric" value="${esc(s.units)}"></label>
    <label class="fld"><span>Model and maker</span><input data-sb="label" value="${esc(s.label)}" placeholder="e.g. 1 Ut FUSO TRUCK"></label>`;
  return top + s.mafis.map((m, i) => `<div class="mcard">
      <div class="mcard-h"><b>MAFI ${i + 1} of ${s.mafis.length}</b>${s.mafis.length > 1 ? `<button class="ic danger" data-sa="rmMafi" data-i="${i}" aria-label="Remove MAFI">${I.bin}</button>` : ''}</div>
      <div class="grid2">
        <label class="fld"><span>MAFI No.</span><input data-mb="no" data-i="${i}" value="${esc(m.no)}" autocapitalize="characters"></label>
        <div class="fld"><span>Loaded</span><div class="seg"><button data-sa="loaded" data-i="${i}" data-v="1" class="${m.loaded ? 'on' : ''}">Yes</button><button data-sa="loaded" data-i="${i}" data-v="0" class="${!m.loaded ? 'on' : ''}">No</button></div></div>
        ${m.loaded ? `<label class="fld"><span>PKGs on MAFI</span><input data-mb="pkgs" data-i="${i}" inputmode="numeric" value="${esc(m.pkgs)}"></label>
        <label class="fld"><span>MT of PKGs</span><input data-mb="mt" data-i="${i}" inputmode="decimal" value="${esc(m.mt)}"></label>` : ''}
        <label class="fld"><span>Tara (MAFI weight, MT)</span><input data-mb="tara" data-i="${i}" inputmode="decimal" value="${esc(m.tara)}"></label>
      </div></div>`).join('') + `<button class="btn" data-sa="addMafi">${I.plus} Add MAFI to this stack</button>`;
}
function openSheet(s) {
  document.querySelector('.sheet-ov')?.remove();
  const ov = document.createElement('div'); ov.className = 'sheet-ov';
  const title = s.type === 'ev' ? 'EV mark' : s.type === 'mafi' ? (s.mafis.length > 1 ? 'MAFI stack' : 'MAFI') : s.type === 'rect' ? 'Units block' : 'Free shape';
  ov.innerHTML = `<div class="sheet" role="dialog"><div class="sheet-h"><b>${title}</b><button class="btn sm danger" data-sa="del">Delete</button><button class="btn sm primary" data-sa="close">Done</button></div><div class="sheet-b">${sheetBody(s)}</div></div>`;
  document.body.append(ov);
  const body = $('.sheet-b', ov), rebuild = () => { body.innerHTML = sheetBody(s); $('.sheet-h b', ov).textContent = s.type === 'mafi' ? (s.mafis.length > 1 ? 'MAFI stack' : 'MAFI') : title; };
  const close = () => { ov.remove(); drawD5(); save(); };
  ov.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.sb) { s[t.dataset.sb] = t.value; }
    if (t.dataset.mb) { s.mafis[+t.dataset.i][t.dataset.mb] = t.value; }
    drawD5(); save();
  });
  ov.addEventListener('change', e => { if (e.target.dataset.sb === 'pod') { UI.pod = e.target.value; } });
  ov.addEventListener('click', async e => {
    if (e.target === ov) return close();
    const b = e.target.closest('[data-sa]'); if (!b) return; const a = b.dataset.sa;
    if (a === 'close') close();
    else if (a === 'del') { ov.remove(); if (await confirmBox('Delete this item from Deck 5?')) { ship().deck5.shapes = ship().deck5.shapes.filter(x => x.id !== s.id); UI.d5.sel = null; save(); } drawD5(); }
    else if (a === 'addMafi') { const last = s.mafis[s.mafis.length - 1]; s.mafis.push({ no: '', loaded: last ? last.loaded : false, pkgs: '', mt: '', tara: '' }); rebuild(); drawD5(); save(); }
    else if (a === 'rmMafi') { s.mafis.splice(+b.dataset.i, 1); rebuild(); drawD5(); save(); }
    else if (a === 'loaded') { s.mafis[+b.dataset.i].loaded = b.dataset.v === '1'; rebuild(); drawD5(); save(); }
  });
}

/* Deck 5 canvas renderer (schematic + PDF) */
function drawD5Shapes(ctx, sh, labels) {
  for (const s of sh.deck5.shapes) {
    if (s.type === 'ev') { if (labels) drawBolt(ctx, s.x + s.w / 2, s.y + s.h / 2, s.w); continue; }
    const p = sh.ports.find(q => q.id === s.pod), c = (p && p.color) || '#cfd8e3';
    ctx.fillStyle = c; ctx.strokeStyle = '#1d2b3f'; ctx.lineWidth = s.type === 'mafi' ? 2.6 : 1.3;
    ctx.beginPath();
    if (s.type === 'free') { s.pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1; }
    else { ctx.rect(s.x, s.y, s.w, s.h); ctx.fill(); }
    ctx.setLineDash(s.type === 'mafi' && s.mafis.every(m => !m.loaded) ? [6, 3] : []); ctx.stroke(); ctx.setLineDash([]);
    if (labels) {
      const { b, fs, lines } = fitLabel(s);
      ctx.fillStyle = textOn(c); ctx.font = `700 ${fs}px Helvetica,Arial,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const y0 = b.y + b.h / 2 - (lines.length - 1) * fs * 1.15 / 2;
      lines.forEach((l, i) => ctx.fillText(l, b.x + b.w / 2, y0 + i * fs * 1.15));
    }
  }
}
function drawD5Canvas(ctx, W, H, sh) {
  const k = W / D5W; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.save(); ctx.scale(k, H / D5H);
  if (D5IMG.complete && D5IMG.naturalWidth) ctx.drawImage(D5IMG, 0, 0, D5W, D5H);
  drawD5Shapes(ctx, sh, true); ctx.restore();
}

/* =========================================================
   PDF
   ========================================================= */
function loadScript(src) { return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error('missing ' + src)); document.head.append(sc); }); }
// Make sure the PDF library is loaded (works whether files sit in the main folder or in vendor/)
async function ensurePdfLib() {
  for (const dir of ['', 'vendor/']) {
    if (!window.jspdf) await loadScript(dir + 'jspdf.umd.min.js').catch(() => { });
    if (window.jspdf && !window.autoTable && !(window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)) await loadScript(dir + 'jspdf.plugin.autotable.min.js').catch(() => { });
  }
  if (!window.jspdf) throw new Error('PDF library file jspdf.umd.min.js is missing on the website. Upload all files again.');
  if (!window.autoTable && !(window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)) throw new Error('PDF table file jspdf.plugin.autotable.min.js is missing on the website. Upload all files again.');
}
async function buildPdf() {
  await ensurePdfLib();
  const sh = ship(), { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const AT = o => (window.autoTable ? window.autoTable(doc, o) : doc.autoTable(o));
  const rows = cargoRows(sh), dep = P(sh.activePol), depName = dep ? dep.name : '-';
  const dstr = sh.depDate ? new Date(sh.depDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const fill = id => hexRgb(colorOf(id));
  const header = title => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(`M/V "${sh.name.toUpperCase()}"`, 10, 11);
    doc.setFontSize(13); doc.text(title, 148.5, 11, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Voyage: ${sh.voyage || '-'}   Departure: ${depName}   Date: ${dstr}`, 287, 11, { align: 'right' });
    doc.setFontSize(7.5); doc.text(rotation(sh), 10, 16);
  };
  const base = { theme: 'grid', styles: { fontSize: 7.5, cellPadding: 0.9, lineColor: [120, 135, 155], lineWidth: 0.1, textColor: [14, 32, 54] }, headStyles: { fillColor: [21, 35, 58], textColor: 255, fontStyle: 'bold' }, footStyles: { fillColor: [226, 232, 240], textColor: [14, 32, 54], fontStyle: 'bold' }, margin: { left: 10, right: 10 } };
  const podCell = id => ({ content: code(id), styles: { fillColor: fill(id), textColor: textOn(colorOf(id)) === '#ffffff' ? 255 : [14, 32, 54], fontStyle: 'bold' } });
  const pods = [...new Set(rows.map(r => r.pod))].sort((a, b) => sh.ports.findIndex(p => p.id === a) - sh.ports.findIndex(p => p.id === b));
  const tot = sumRows(rows);

  // Page 1: stowage plan
  header('CARGO STOWAGE PLAN');
  AT({ ...base, startY: 19, tableWidth: 180, head: [['POD', 'Hold 4', 'Hold 3', 'Hold 2', 'Hold 1', 'Units', 'PKGs', 'MT statics']],
    body: pods.map(pod => { const m = rows.filter(r => r.pod === pod), a = sumRows(m); return [podCell(pod), ...[4, 3, 2, 1].map(h => fmt(m.filter(r => r.hold === h).reduce((x, r) => x + r.units, 0))), fmt(a.units), fmt(a.pkgs), fmt(a.mt, 1)]; }),
    foot: [['Total', ...[4, 3, 2, 1].map(h => fmt(rows.filter(r => r.hold === h).reduce((x, r) => x + r.units, 0))), fmt(tot.units), fmt(tot.pkgs), fmt(tot.mt, 1)]] });
  let y = doc.lastAutoTable.finalY + 3; const ih = 210 - y - 7, iw = Math.min(277, ih * 1.5);
  const cv = document.createElement('canvas'); cv.width = 2000; cv.height = Math.round(2000 * ih / iw);
  drawShip(cv.getContext('2d'), cv.width, cv.height, sh, LIGHT);
  doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 10 + (277 - iw) / 2, y, iw, ih);

  // Page 2: stowage detail
  doc.addPage(); header('STOWAGE DETAIL');
  const det = []; DECKS.forEach(d => holdsFor(d).forEach(h => rows.filter(r => r.deck === d && r.hold === h).forEach(r => det.push([`DK ${d}`, `Hold ${h}`, heightOf(d, h)?.[2] || '', podCell(r.pod), code(r.pol), r.units ? fmt(r.units) : '', r.pkgs ? fmt(r.pkgs) : '', r.mt ? fmt(r.mt, 1) : '', r.brand]))));
  AT({ ...base, startY: 19, head: [['Deck', 'Hold', 'Unit height', 'POD', 'POL', 'Units', 'PKGs', 'MT', 'Brand / model']], body: det.length ? det : [['', '', '', '', '', '', '', '', 'No cargo on board']] });

  // Page 3: summary
  doc.addPage(); header('CARGO SUMMARY');
  const sb = [];
  loadPorts().forEach(p => {
    const mine = rows.filter(r => r.pol === p.id), a = sumRows(mine), st = expStatus(p, a);
    [...new Set(mine.map(r => r.pod))].forEach(pod => { const b = sumRows(mine.filter(r => r.pod === pod)); sb.push([p.name + ' (' + p.code + ')', podCell(pod), fmt(b.units), fmt(b.pkgs), fmt(b.mt, 1), '', '']); });
    const stc = st.s === 'ok' ? { content: 'OK', styles: { fillColor: [61, 200, 120], fontStyle: 'bold' } } : st.s === 'off' ? { content: 'Check', styles: { fillColor: [255, 199, 44], fontStyle: 'bold' } } : '';
    sb.push([{ content: 'Total at ' + p.code, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, { content: '', styles: { fillColor: [241, 245, 249] } }, { content: fmt(a.units), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, { content: fmt(a.pkgs), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, { content: fmt(a.mt, 1), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, { content: `${p.expUnits || '-'} / ${p.expPkgs || '-'}`, styles: { fillColor: [241, 245, 249] } }, stc]);
  });
  AT({ ...base, startY: 19, head: [['Loading port', 'POD', 'Units', 'PKGs', 'MT', 'Expected units / PKGs', 'Status']], body: sb, foot: [['Grand total', '', fmt(tot.units), fmt(tot.pkgs), fmt(tot.mt, 1), '', '']] });
  doc.setFontSize(7); doc.text('PKGs: packages on loaded MAFIs; an empty MAFI or empty MAFI stack counts as 1 PKG. MT: package weight plus MAFI tare.', 10, doc.lastAutoTable.finalY + 5);

  // Page 4: deck 5 + MAFI list
  doc.addPage(); header('DECK 5 (MAIN DECK) AND MAFI LIST');
  try { await D5IMG.decode(); } catch (e) { }
  const c5 = document.createElement('canvas'); c5.width = 2400; c5.height = Math.round(2400 * D5H / D5W);
  drawD5Canvas(c5.getContext('2d'), c5.width, c5.height, sh);
  doc.addImage(c5.toDataURL('image/jpeg', 0.92), 'JPEG', 10, 19, 277, 277 * D5H / D5W);
  const ml = mafiList(sh);
  AT({ ...base, startY: 19 + 277 * D5H / D5W + 4, head: [['Hold', 'POD/POL', 'MAFI No.', 'Stack', 'Loaded', 'PKGs', 'MT', 'Tara']],
    body: ml.length ? ml.map(x => [`Hold ${x.hold}`, { content: x.podpol, styles: { fillColor: hexRgb(x.color), fontStyle: 'bold' } }, x.no || '-', x.stack, x.loaded ? 'Yes' : 'No', fmt(x.pkgs), fmt(x.mt, 1), fmt(x.tara, 1)]) : [['', '', '', '', '', '', '', 'No MAFIs']],
    foot: ml.length ? [['Total', '', ml.length + ' MAFIs', '', '', fmt(ml.reduce((a, x) => a + x.pkgs, 0)), fmt(ml.reduce((a, x) => a + x.mt, 0), 1), fmt(ml.reduce((a, x) => a + x.tara, 0), 1)]] : undefined });

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(110); doc.text(`Page ${i} of ${n}   Created ${new Date().toLocaleString('en-GB')}`, 287, 205, { align: 'right' }); doc.setTextColor(0); }

  const dd = sh.depDate ? new Date(sh.depDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-') : 'nodate';
  const name = `${sh.short || 'SHIP'}-Stowage_Plan_Dep_${depName.replace(/[^A-Za-z0-9]+/g, '_')}_${dd}_VOY_${(sh.voyage || '').replace(/[^A-Za-z0-9]+/g, '') || 'NA'}.pdf`;
  return { blob: doc.output('blob'), name };
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
async function shareFile(blob, name, type, title) {
  const f = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title }); } catch (e) { if (e.name !== 'AbortError') toast('Sharing failed: ' + e.message); }
  } else download(blob, name);
}

/* =========================================================
   Events
   ========================================================= */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, sh = ship(), v = b.dataset.v, id = b.dataset.id;
  switch (a) {
    case 'open': UI.view = 'plan'; UI.tab = 'ship'; render(); break;
    case 'home': UI.view = 'home'; render(); break;
    case 'tab': UI.tab = v; render(); break;
    case 'toShip': UI.view = 'plan'; UI.tab = 'ship'; render(); break;
    case 'openD5': UI.view = 'deck5'; UI.d5.zoom = null; render(); break;
    case 'openMafi': UI.view = 'deck5'; UI.d5.zoom = null; UI.d5.sel = id; UI.d5.tool = 'select'; render(); { const s = sh.deck5.shapes.find(x => x.id === id); if (s) openSheet(s); } break;
    // ports
    case 'addPort': {
      const c = b.dataset.code, p = { id: uid(), locode: c, name: b.dataset.name.split(',')[0], code: uniqueCode(c.slice(2)), type: 'D', color: nextColor(), expUnits: '', expPkgs: '' };
      sh.ports.push(p); save(); UI.openPort = p.id; render(); toast(`${p.name} added as discharging port.`); break;
    }
    case 'setLoc': {
      const p = P(id); p.locode = b.dataset.code; p.name = b.dataset.name.split(',')[0]; p.code = uniqueCode(b.dataset.code.slice(2), p.id);
      save(); rerender(); toast(`UN/LOCODE changed to ${p.locode}. Plan now shows ${p.code}.`); break;
    }
    case 'portOpen': UI.openPort = UI.openPort === id ? null : id; rerender(); break;
    case 'ptype': { const p = P(id); p.type = v; if (v !== 'L' && !p.color) p.color = nextColor(); if (v === 'L' && sh.activePol == null) sh.activePol = p.id; save(); rerender(); break; }
    case 'pcolor': { const other = sh.ports.find(p => p.id !== id && p.color === v && p.type !== 'L'); if (other) toast(`${other.code} already uses this colour.`); P(id).color = v; save(); rerender(); break; }
    case 'portDel': {
      const p = P(id), used = cargoRows(sh).filter(r => r.pod === id || r.pol === id).length;
      const ok = await confirmBox(used ? `${p.code} is used by ${used} cargo record(s). Delete the port and its cargo?` : `Delete ${p.code} (${p.name})?`);
      if (!ok) break;
      sh.ports = sh.ports.filter(x => x.id !== id);
      for (const k in sh.holds) { const ho = sh.holds[k]; ho.cells = ho.cells.map(c => (c === id ? null : c)); ho.entries = ho.entries.filter(en => en.pod !== id && en.pol !== id); }
      sh.deck5.shapes = sh.deck5.shapes.filter(s => s.pod !== id && s.pol !== id);
      if (sh.activePol === id) sh.activePol = null;
      save(); rerender(); break;
    }
    // hold editor
    case 'mode': UI.mode = v; rerender(); break;
    case 'pickPod': UI.pod = v; $$('.chip').forEach(c => c.classList.toggle('on', c.dataset.v === v)); { const f = $('[data-act="fillHold"]'); if (f) f.textContent = 'Fill with ' + code(v); } break;
    case 'undo': { const ho = getHold(UI.deck, UI.hold, true); if (UI.undo.length) { const u = UI.undo.pop(); ho.cells = u.cells; ho.arrows = u.arrows; ho.evs = u.evs || []; if (UI.mode === 'ev' || UI.mode === 'arrow') rerender(); else { drawHoldGrid(); refreshHoldMeta(); } save(); } break; }
    case 'fillHold': if (!UI.pod) break; { pushUndo(); const ho = getHold(UI.deck, UI.hold, true); ho.cells.fill(UI.pod); drawHoldGrid(); afterStroke('paint'); } break;
    case 'clearEvs': { const ho = getHold(UI.deck, UI.hold, true); if (await confirmBox(`Remove all ${ho.evs.length} EV marks from this hold?`, 'Remove EV marks')) { pushUndo(); ho.evs = []; save(); rerender(); } break; }
    case 'clearArrows': { const ho = getHold(UI.deck, UI.hold, true); if (await confirmBox(`Remove all ${ho.arrows.length} arrows from this hold?`, 'Remove arrows')) { pushUndo(); ho.arrows = []; save(); rerender(); } break; }
    case 'clearHold': { pushUndo(); const ho = getHold(UI.deck, UI.hold, true); ho.cells.fill(null); drawHoldGrid(); afterStroke('erase'); } break;
    case 'addEntry': { const ho = getHold(UI.deck, UI.hold, true); if (!dischPorts().length) { toast('Add a discharging port first.'); break; } ho.entries.push({ id: uid(), pod: UI.pod || dischPorts()[0].id, pol: sh.activePol || '', units: '', brand: '' }); save(); $('#entries').innerHTML = entriesHtml(ho); const last = $$('#entries .entry').pop(); last && $('[data-ebind="units"]', last).focus(); break; }
    case 'delEntry': { const ho = getHold(UI.deck, UI.hold, true); const en = ho.entries.find(x => x.id === id); if (await confirmBox(`Remove ${en.units || 0} ${code(en.pod)} units from this hold?`, 'Remove')) { ho.entries = ho.entries.filter(x => x.id !== id); save(); $('#entries').innerHTML = entriesHtml(ho); refreshHoldMeta(); } break; }
    case 'navDeck': { const d = +v; if (d === 5) { UI.view = 'deck5'; UI.d5.zoom = null; UI.d5.vb = null; UI.d5.sel = null; } else { UI.view = 'hold'; UI.deck = d; if (!holdsFor(d).includes(UI.hold)) UI.hold = holdsFor(d)[0]; UI.undo = []; } render(); break; }
    case 'navHold': if (UI.view === 'deck5') { UI.d5.zoom = v === 'all' ? null : +v; UI.d5.vb = null; render(); } else { UI.hold = +v; UI.undo = []; render(); } break;
    // deck 5
    case 'd5tool': setTool(v); break;
    case 'd5zoom': { const vb = d5VB(), cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2; if (v === 'fit') { UI.d5.vb = null; UI.d5.zoom = null; render(); } else zoomAt(v === 'in' ? 1 / 1.6 : 1.6, cx, cy); break; }
    case 'd5Del': { const s = sh.deck5.shapes.find(x => x.id === UI.d5.sel); if (s && await confirmBox('Delete the selected item from Deck 5?')) { sh.deck5.shapes = sh.deck5.shapes.filter(x => x.id !== s.id); UI.d5.sel = null; save(); drawD5(); } break; }
    // export
    case 'makePdf': {
      b.disabled = true; b.textContent = 'Creating PDF…';
      try { UI.pdf = await buildPdf(); rerender(); toast('PDF created.'); } catch (err) { console.error(err); toast('Could not create PDF: ' + err.message); b.disabled = false; b.textContent = 'Create PDF'; }
      break;
    }
    case 'sharePdf': if (UI.pdf) { try { navigator.clipboard && navigator.clipboard.writeText(sh.email).catch(() => { }); } catch (e) { } shareFile(UI.pdf.blob, UI.pdf.name, 'application/pdf', UI.pdf.name.replace('.pdf', '')); } break;
    case 'savePdf': if (UI.pdf) shareFile(UI.pdf.blob, UI.pdf.name, 'application/pdf', UI.pdf.name); break;
    case 'backup': { const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }); shareFile(blob, `stowage-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', 'Stowage backup'); break; }
    case 'newVoyage': {
      if (!(await confirmBox(`Remove all cargo and all ports for ${sh.name}? Save a backup first if you may need this voyage again.`, 'Clear all'))) break;
      sh.holds = {}; sh.deck5 = { shapes: [], v2: true }; sh.ports = []; sh.activePol = null; UI.pod = null; UI.openPort = null; UI.pdf = null;
      save(); UI.tab = 'ports'; rerender(); toast('Cargo and ports cleared. Add the ports for the new voyage.'); break;
    }
  }
});
document.addEventListener('input', e => {
  const t = e.target, sh = ship();
  if (t.dataset.bind) {
    sh[t.dataset.bind] = t.value; save();
    const r = $('#rot'); if (r) r.textContent = rotation(sh);
  } else if (t.dataset.pbind) {
    const p = P(t.dataset.id); let v = t.value; if (t.dataset.pbind === 'code') { v = v.toUpperCase().replace(/\s/g, ''); t.value = v; }
    p[t.dataset.pbind] = v; save();
    if (t.dataset.pbind === 'code' || t.dataset.pbind === 'name') { const li = t.closest('.prow'); $('.pinfo b', li).textContent = p.code; $('.pinfo span', li).textContent = p.name; const r = $('#rot'); if (r) r.textContent = rotation(sh); }
  } else if (t.dataset.hbind) {
    const [d, h] = t.dataset.hbind.split('-').map(Number); getHold(d, h, true).height = t.value; save();
  } else if (t.dataset.ebind) {
    const ho = getHold(UI.deck, UI.hold, true), en = ho.entries.find(x => x.id === t.closest('.entry').dataset.id);
    en[t.dataset.ebind] = t.value; save();
    if (t.dataset.ebind === 'pod') $('.dot', t.closest('.entry')).style.background = colorOf(t.value);
    refreshHoldMeta();
  }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.bind === 'activePol' || t.dataset.bind === 'name') rerender();
  if (t.dataset.pbind === 'expUnits' || t.dataset.pbind === 'expPkgs') rerender();
  if (t.dataset.pbind === 'code' && !t.value) { const p = P(t.dataset.id); p.code = uniqueCode(p.locode.slice(2), p.id); save(); rerender(); }
  if (t.dataset.pos) {
    const sh = ship(), from = sh.ports.findIndex(p => p.id === t.dataset.pos), to = +t.value;
    const [p] = sh.ports.splice(from, 1); sh.ports.splice(to, 0, p); save(); rerender();
    toast(`${p.code} moved to position ${to + 1}.`);
    const li = document.querySelector(`.prow[data-id="${p.id}"]`); if (li) { li.classList.add('moved'); li.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    return;
  }
  if (t.id === 'restore' && t.files[0]) {
    try {
      const d = JSON.parse(await t.files[0].text());
      if (!d || !Array.isArray(d.ships) || !d.ships.length) throw new Error('This file is not a stowage backup.');
      if (!(await confirmBox('Replace all data on this iPhone with the backup?', 'Restore', false))) return;
      S = d; S.ships.forEach(fixShip); if (!S.ships.some(s => s.id === S.shipId)) S.shipId = S.ships[0].id; save(); UI.view = 'home'; render(); toast('Backup restored.');
    } catch (err) { toast('Restore failed: ' + err.message); }
  }
});
let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (UI.view === 'plan' && UI.tab === 'ship') afterShip(); if (UI.view === 'hold') drawHoldGrid(); }, 150); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (UI.view === 'plan' && UI.tab === 'ship') afterShip(); if (UI.view === 'hold') drawHoldGrid(); });

/* ---------- Start ---------- */
(async () => {
  await load(); render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  locode().catch(() => { });
})();
