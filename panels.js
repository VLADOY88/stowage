'use strict';
/* =========================================================
   Movable car-deck panels (Deck 8 over Deck 7, Deck 6 over Deck 5)
   Each panel: Normal / Middle / Full up. Heights follow the panel:
     Deck 8 panel: Normal 220 (DK7 below 220), Middle 185 (DK7 255), Full up 0 (DK7 420)
     Deck 6 panel: Normal 220 (DK5 below 305), Middle 185 (DK5 340), Full up 0 (DK5 510)
   ========================================================= */
const PSTATES = [['normal', 'Normal', '#5ee6f0'], ['mid', 'Middle', '#6ee07a'], ['full', 'Full up', '#ff7b7b']];
const PH = { 8: { normal: 220, mid: 185, full: 0 }, 7: { normal: 220, mid: 255, full: 420 }, 6: { normal: 220, mid: 185, full: 0 }, 5: { normal: 305, mid: 340, full: 510 } };
const PANEL_DECK = { 8: 8, 7: 8, 6: 6, 5: 6 };            // which panel deck controls each deck
const FIXED_H = { 8: 220, 7: 220 };                        // fixed deck ends on 8 (and 7 below them)
// Hull outline of each deck in the planner's drawing scale (same frame for all decks)
const SIMBOX = { 12: [27, 30, 935, 191], 11: [21, 3, 1325, 213], 10: [21, 3, 1325, 213], 9: [21, 3, 1325, 213], 8: [21, 3, 1325, 213], 7: [15, 3, 1325, 213], 6: [21, 3, 1313, 213], 5: [6, 3, 1222, 213], 4: [354, 3, 1222, 213], 3: [354, 3, 1146, 213], 2: [354, 3, 1005, 213], 1: [354, 4, 1005, 211] };
// Panel layout taken from the panel plan drawing (x boundaries aft → fwd, numbered from the bow)
const PANEL_SRC = {
  8: { x0: 0, x1: 1455, top: 28, bot: 280, cl: 155, P: [135, 210, 305, 372, 452, 550, 630, 710, 790, 848, 945, 1027, 1105, 1185, 1265, 1315], S: [135, 210, 305, 372, 475, 550, 630, 710, 790, 870, 945, 1027, 1105, 1185, 1265, 1315] },
  6: { x0: 5, x1: 1445, top: 25, bot: 275, cl: 150, P: [5, 115, 215, 305, 400, 472, 550, 630, 705, 790, 843, 948, 1027, 1105, 1185, 1263, 1345], S: [5, 115, 215, 305, 400, 472, 550, 630, 705, 790, 870, 948, 1027, 1105, 1185, 1263, 1345] }
};
// Panels as fractions of the hull box: {id, side, fx0, fx1, fy0, fy1}
const PANELS = {};
for (const d of [8, 6]) {
  const s = PANEL_SRC[d], W = s.x1 - s.x0, H = s.bot - s.top, list = [];
  for (const side of ['P', 'S']) {
    const b = s[side], n = b.length - 1;
    for (let i = 0; i < n; i++) list.push({ id: `${d}D-${n - i}${side}`, side, fx0: (b[i] - s.x0) / W, fx1: (b[i + 1] - s.x0) / W, fy0: side === 'P' ? 0.015 : (s.cl - s.top) / H, fy1: side === 'P' ? (s.cl - s.top) / H : 0.985 });
  }
  PANELS[d] = list;
}
// fraction of the panel deck's hull box → coordinates on deck t (its own picture, or deck-5 units)
function panelXfm(pd, t) {
  const B = DECKBOX[t], Sp = SIMBOX[pd], St = SIMBOX[t];
  const X = fx => { const sx = Sp[0] + fx * (Sp[2] - Sp[0]); return B[0] + (sx - St[0]) / (St[2] - St[0]) * (B[2] - B[0]); };
  const Y = fy => B[1] + fy * (B[3] - B[1]);
  return { X, Y };
}
const panelState = id => (ship().panels && ship().panels[id]) || 'normal';
function panelRects(t) {
  const pd = PANEL_DECK[t]; if (!pd) return [];
  const { X, Y } = panelXfm(pd, t);
  return PANELS[pd].map(p => ({ ...p, x0: X(p.fx0), x1: X(p.fx1), y0: Y(p.fy0), y1: Y(p.fy1), st: panelState(p.id) }));
}
// Heights present on a deck (cm), from the panel plan
function deckHeights(d) {
  const pd = PANEL_DECK[d]; if (!pd) return null;
  const hs = new Set(PANELS[pd].map(p => PH[d][panelState(p.id)]));
  if (FIXED_H[d]) hs.add(FIXED_H[d]);
  return [...hs].sort((a, b) => b - a);
}
// Is the point (deck coordinates) on a full-up panel? (not loadable on decks 6 and 8)
function onFullPanel(d, x, y) {
  if (d !== 6 && d !== 8) return false;
  return panelRects(d).some(r => r.st === 'full' && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
}
// Edges where the panel position changes → red dotted lines
function panelChangeLines(t) {
  const R = panelRects(t); if (!R.length) return [];
  const pd = PANEL_DECK[t], out = [], eps = 0.5, n = s => (s === 'normal' ? 'normal' : s);
  const ov = (a0, a1, b0, b1) => [Math.max(a0, b0), Math.min(a1, b1)];
  R.forEach(a => {
    // vertical edges (fore/aft neighbours on the same side)
    for (const [x, dir] of [[a.x0, -1], [a.x1, 1]]) {
      const nb = R.filter(b => b !== a && b.side === a.side && Math.abs((dir < 0 ? b.x1 : b.x0) - x) < eps);
      // only between panels in different positions; the forward/aft ends are not marked
      nb.forEach(b => { if (b.st !== a.st && dir > 0) out.push([x, a.y0, x, a.y1]); });
    }
    // centreline edges between P and S panels
    if (a.side === 'P') R.filter(b => b.side === 'S').forEach(b => { const [s0, s1] = ov(a.x0, a.x1, b.x0, b.x1); if (s1 - s0 > eps && b.st !== a.st) out.push([s0, a.y1, s1, a.y1]); });
  });
  return out;
}
// Groups of neighbouring panels in the same position (for height labels)
function panelGroups(t) {
  const R = panelRects(t), par = R.map((_, i) => i), f = i => (par[i] === i ? i : (par[i] = f(par[i]))), eps = 0.5;
  R.forEach((a, i) => R.forEach((b, j) => {
    if (j <= i || a.st !== b.st) return;
    const touchX = a.side === b.side && (Math.abs(a.x1 - b.x0) < eps || Math.abs(b.x1 - a.x0) < eps);
    const touchY = a.side !== b.side && Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > eps;
    if (touchX || touchY) par[f(i)] = f(j);
  }));
  const G = {}; R.forEach((r, i) => { (G[f(i)] ||= []).push(r); });
  return Object.values(G).map(g => ({ st: g[0].st, x0: Math.min(...g.map(r => r.x0)), x1: Math.max(...g.map(r => r.x1)), y0: Math.min(...g.map(r => r.y0)), y1: Math.max(...g.map(r => r.y1)), n: g.length, rects: g }));
}
// SVG layer for a deck picture (decks 5–8); u = deck units per screen pixel
function panelLayerSvg(t, u, editing) {
  const pd = PANEL_DECK[t]; if (!pd) return '';
  const R = panelRects(t); let out = '';
  if (t === pd) {
    let rects = '', ids = '';
    R.forEach(r => {
      const col = PSTATES.find(s => s[0] === r.st)[2];
      if (editing) { rects += `<rect x="${r.x0}" y="${r.y0}" width="${r.x1 - r.x0}" height="${r.y1 - r.y0}" fill="${col}" fill-opacity=".45" stroke="#33465f" stroke-width="1" data-panel="${r.id}"/>`; ids += `<text x="${(r.x0 + r.x1) / 2}" y="${(r.y0 + r.y1) / 2}" font-size="${10 * u}" text-anchor="middle" dominant-baseline="middle" class="pnl-id">${r.id.slice(3)}</text>`; }
      else if (r.st === 'full') rects += `<rect x="${r.x0}" y="${r.y0}" width="${r.x1 - r.x0}" height="${r.y1 - r.y0}" fill="url(#fullHatch)" />`;
    });
    out += `<g mask="url(#hullMask)">${rects}</g>${ids}`;
  }
  const lines = panelChangeLines(t);
  // clipped to the inside of the blue hull/hold outline
  out += `<g mask="url(#hullMask)">${lines.map(l => `<line x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}" class="pnl-chg"/>`).join('')}</g>`;
  // height labels per group of panels
  panelGroups(t).forEach(g => {
    const h = PH[t][g.st], txt = t === pd && g.st === 'full' ? 'FULL UP' : `H${h}`;
    if (!editing && t === pd && g.st === 'normal' && !lines.length) return;
    out += `<text x="${(g.x0 + g.x1) / 2}" y="${(g.y0 + g.y1) / 2}" font-size="${13 * u}" text-anchor="middle" dominant-baseline="middle" class="pnl-h ${g.st}">${txt}</text>`;
  });
  return `<defs><pattern id="fullHatch" patternUnits="userSpaceOnUse" width="${8 * u}" height="${8 * u}" patternTransform="rotate(45)"><rect width="${8 * u}" height="${8 * u}" fill="#9aa3ad" fill-opacity=".35"/><line x1="0" y1="0" x2="0" y2="${8 * u}" stroke="#5c6670" stroke-width="${2 * u}" stroke-opacity=".6"/></pattern></defs><g class="pnl-layer">${out}</g>`;
}
function panelBarHtml(d) {
  const cur = UI.panelSet || 'full';
  return `<div class="panel-bar"><span class="chips-lbl">Set panels to</span>${PSTATES.map(([k, n, c]) => `<button class="chip ${cur === k ? 'on' : ''}" data-pnl="set" data-v="${k}" style="--c:${c};--t:#0e2036">${n}</button>`).join('')}
    <button class="btn sm" data-pnl="hold">All of Hold ${UI.hold} → ${PSTATES.find(s => s[0] === cur)[1]}</button>
    <button class="btn sm" data-pnl="deck">Whole Deck ${d} → ${PSTATES.find(s => s[0] === cur)[1]}</button>
    <span class="muted small">Tap or drag over panels. Heights on Deck ${d} and Deck ${d - 1} follow automatically.</span></div>`;
}
function setPanels(ids, st) { const sh = ship(); sh.panels ||= {}; ids.forEach(id => { if (st === 'normal') delete sh.panels[id]; else sh.panels[id] = st; }); save(); }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pnl]'); if (!b) return;
  const a = b.dataset.pnl, d = UI.deck;
  if (a === 'set') { UI.panelSet = b.dataset.v; rerender(); return; }
  const st = UI.panelSet || 'full';
  if (a === 'deck') { setPanels(PANELS[d].map(p => p.id), st); rerender(); }
  if (a === 'hold') { const z = deckHolds(d).find(q => q.h === UI.hold); const R = panelRects(d).filter(r => (r.x0 + r.x1) / 2 >= z.x0 && (r.x0 + r.x1) / 2 < z.x1); setPanels(R.map(r => r.id), st); rerender(); }
});
