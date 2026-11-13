'use strict';
/* =========================================================
   Stability: one point per stack (POD/POL) per hold
   ========================================================= */
// Standard loading condition, hold full of units: [LCG, TCG] in m (Cargo Hold Center table)
const STAB_FULL = {
  12: { 4: [71.87, 0], 3: [22.44, 0], 2: [-21.93, 0] },
  11: { 4: [72.98, 0], 3: [20.49, 0], 2: [-29.68, 0], 1: [-73.98, 0] },
  10: { 4: [73.32, 0], 3: [20.82, 0], 2: [-29.6, 0], 1: [-73.9, 0] },
  9: { 4: [73.24, 0], 3: [21.36, 0], 2: [-29.38, 0], 1: [-74.12, 0] },
  8: { 4: [73.18, 0], 3: [20.93, 0], 2: [-29.54, 0], 1: [-74.91, 0] },
  7: { 4: [67.64, 0], 3: [19.94, 0], 2: [-28.83, 0], 1: [-65.68, 0] },
  6: { 4: [73.01, 0], 3: [20.66, 0], 2: [-29.51, 0], 1: [-67.3, 0] },
  5: { 4: [72.95, 0], 3: [18.51, 0], 2: [-29.11, 0], 1: [-64.69, 0] },
  4: { 3: [19.8, 0], 2: [-28.88, 0], 1: [-61.79, 0] },
  3: { 3: [19.68, 0], 2: [-28.02, 0], 1: [-59.04, 0] },
  2: { 3: [19.35, 0], 2: [-26.14, 0] },
  1: { 3: [18.19, 0], 2: [-25.15, 0] }
};
// Deck stability plans: picture position → ship metres (Mid.G: + aft of midship; TCG: − port / + starboard)
// x: [px1, m1, px2, m2]  y: [py1, m1, py2, m2]   (added deck by deck as the plans are received)
const STABMAP = {
  12: { x: [353, 48.85, 751, -7.76], y: [50, -12.37, 252, 12.37] },
  11: { x: [358, 48.85, 756, -7.64], y: [18, -16.13, 279, 16.13] },
  10: { x: [358, 48.88, 756, -7.77], y: [17, -16.13, 278, 16.13] },
  9: { x: [359, 48.88, 758, -7.77], y: [18, -16.13, 278, 16.13] },
  8: { x: [359, 48.88, 758, -7.77], y: [18, -16.13, 277, 16.13] },
  7: { x: [362, 48.88, 759, -7.77], y: [18, -16.13, 276, 16.13] },
  6: { x: [361, 48.88, 759, -7.77], y: [17, -16.13, 278, 16.13] },
  5: { x: [275, 48.88, 581, -7.77], y: [26, -16.13, 273, 16.13] },  // deck 5 in deck-5 units
  4: { x: [1, 48.88, 400, -7.77], y: [18, -16.13, 279, 16.13] },
  3: { x: [1, 48.88, 399, -7.77], y: [18, -16.13, 278, 16.13] },
  2: { x: [1, 48.88, 399, -7.77], y: [18, -16.13, 278, 16.13] },
  1: { x: [0, 48.88, 398, -7.77], y: [19, -16.13, 282, 16.13] }
};
// Deck height above base line (m); cargo KG = deck height + 0.7 m (standard for cars). Added deck by deck.
const DECK_BL = { 12: 34.54, 11: 32.10, 10: 29.48, 9: 26.84, 7: 21.32, 5: 14.71, 4: 11.56, 3: 8.93, 2: 6.30, 1: 4.01 };
const KG_ADD = 0.7;
// Hoistable decks: deck height depends on the panel position (Low = Normal, 1st = Middle, 2nd = Full up)
const PANEL_BL = { 8: { normal: 24.16, mid: 24.51, full: 26.11 }, 6: { normal: 18.39, mid: 18.74, full: 20.42 } };
const deckKG = d => (DECK_BL[d] != null ? DECK_BL[d] + KG_ADD : PANEL_BL[d] ? PANEL_BL[d].normal + KG_ADD : null);
function panelStateAt(d, x, y) { const r = typeof panelRects === 'function' ? panelRects(d).find(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) : null; return r ? r.st : 'normal'; }
// KG of a stack from where its figures stand (panel decks), otherwise from the deck height
function stackKG(d, figs, h) {
  if (!PANEL_BL[d]) return deckKG(d);
  const z = deckHolds(d).find(q => q.h === h), g = DECKPIC[d]; let a = 0, m = 0;
  figs.forEach(f => {
    if (f.cells && z) f.cells.forEach(i => { const x = z.x0 + ((i % GC) + 0.5) * (z.x1 - z.x0) / GC, y = (Math.floor(i / GC) + 0.5) * g.h / GR; a++; m += PANEL_BL[d][panelStateAt(d, x, y)] + KG_ADD; });
    else { a += f.area; m += (PANEL_BL[d][panelStateAt(d, f.x, f.y)] + KG_ADD) * f.area; }
  });
  return a ? m / a : deckKG(d);
}
const DECKNAME = d => (d === 12 ? 'Garage' : `No. ${d} Car Deck`);
const lin = (v, m) => m[1] + (v - m[0]) * (m[3] - m[1]) / (m[2] - m[0]);

function stabStacks() {
  const sh = ship(), defW = num(sh.stabDefWt || 1.6), out = [];
  for (const d of DECKS) {
    for (const h of holdsFor(d)) {
      const std = STAB_FULL[d] && STAB_FULL[d][h];
      if (d === 5) {
        const items = sh.deck5.shapes.filter(s => s.type !== 'ev' && shapeHold(s) === h), keys = [...new Set(items.map(s => s.pod + '|' + (s.pol || '')))];
        keys.forEach(k => {
          const its = items.filter(s => s.pod + '|' + (s.pol || '') === k); let n = 0, w = 0, mx = 0, my = 0;
          its.forEach(s => { const t = s.type === 'mafi' ? mafiTotals(s) : null, u = s.type === 'mafi' ? 0 : s.type === 'pkg' ? num(s.pkgs) : num(s.units), wt = t ? t.mt : (num(s.wt) || defW) * Math.max(u, 1), b = bbox(s); n += u; w += wt; mx += (b.x + b.w / 2) * wt; my += (b.y + b.h / 2) * wt; });
          const [pod, pol] = k.split('|'), M = STABMAP[5];
          out.push({ d, h, pod, pol, n, w, lcg: M ? lin(mx / w, M.x) : std ? std[0] : null, tcg: M ? lin(my / w, M.y) : std ? std[1] : null, src: M ? 'plan' : 'standard (plan not added)', kg: deckKG(5) });
        });
        continue;
      }
      const o = sh.holds[d + '-' + h]; if (!o) continue;
      const pl = holdPols(o), figs = holdFigures(d, h), M = STABMAP[d];
      const keys = [...new Set([...o.entries.filter(e => num(e.units) > 0).map(e => e.pod + '|' + (e.pol || '')), ...figs.map(f => f.pod + '|' + (f.pol || ''))])];
      let paintable = 0, painted = 0; for (let i = 0; i < GC * GR; i++) if (cellOk(d, h, i)) { paintable++; if (o.cells[i]) painted++; }
      const full = paintable && painted / paintable >= 0.97;
      keys.forEach(k => {
        const [pod, pol] = k.split('|'), ents = o.entries.filter(e => e.pod === pod && (e.pol || '') === pol);
        const n = ents.reduce((a, e) => a + num(e.units), 0), w = ents.reduce((a, e) => a + num(e.units) * (num(e.wt) || defW), 0);
        const fs = figs.filter(f => f.pod === pod && (f.pol || '') === pol), area = fs.reduce((a, f) => a + f.area, 0);
        let lcg = std ? std[0] : null, tcg = std ? std[1] : null, src = 'standard';
        if (full && keys.length === 1) src = 'standard (hold full)';
        else if (M && area > 0) { lcg = lin(fs.reduce((a, f) => a + f.x * f.area, 0) / area, M.x); tcg = lin(fs.reduce((a, f) => a + f.y * f.area, 0) / area, M.y); src = 'plan (figure centre)'; }
        else src = M ? 'standard (nothing painted)' : 'standard (deck plan not added yet)';
        out.push({ d, h, pod, pol, n, w, lcg, tcg, kg: stackKG(d, fs, h), src });
      });
    }
  }
  return out;
}
function tabStabHtml() {
  const sh = ship(), rows = stabStacks(), defW = sh.stabDefWt || '1.6';
  const T = rows.reduce((a, r) => { a.n += r.n; a.w += r.w; if (r.lcg != null) { a.mx += r.w * r.lcg; a.my += r.w * r.tcg; a.wl += r.w; } if (r.kg != null) { a.mz += r.w * r.kg; a.wk += r.w; } return a; }, { n: 0, w: 0, mx: 0, my: 0, wl: 0, mz: 0, wk: 0 });
  const decks = DECKS.filter(d => rows.some(r => r.d === d));
  return `<div class="card">
    <p class="muted">One point per stack (POD/POL) per hold. A full hold with one stack uses the standard loading condition. Otherwise the centre of the painted figures is used where the deck stability plan has been added (now: ${Object.keys(STABMAP).length === 12 ? 'all decks' : Object.keys(STABMAP).map(d => DECKNAME(+d)).join(', ')}); other decks use the standard hold values. KG = deck height + 0.7 m (deck heights added: ${Object.keys(DECK_BL).map(d => DECKNAME(+d) + ' ' + DECK_BL[d] + ' m').join(', ')}${Object.keys(PANEL_BL).length ? '; ' + Object.keys(PANEL_BL).map(d => `${DECKNAME(+d)} by panel: Low ${PANEL_BL[d].normal} / 1st ${PANEL_BL[d].mid} / 2nd ${PANEL_BL[d].full} m`).join(', ') : ''}).</p>
    <label class="fld"><span>Weight per unit when not entered (t)</span><input inputmode="decimal" data-stab="defwt" value="${esc(defW)}"></label>
    <button class="btn primary" data-stab="pdf">Export to PDF</button>
    ${UI.pdfStab ? `<div class="pdfready"><p><b>${esc(UI.pdfStab.name)}</b> is ready.</p><button class="btn primary" data-act="sharePdf" data-v="pdfStab">Email PDF</button><button class="btn" data-act="savePdf" data-v="pdfStab">Save to Files</button></div>` : ''}
  </div>
  <div class="card"><div class="sc-h"><b>Total cargo</b></div><p>${fmt(T.n)} units, <b>${fmt(T.w, 1)} t</b>${T.wl ? `, Mid.G ${fmt(T.mx / T.wl, 2)} m, TCG ${fmt(T.my / T.wl, 2)} m` : ''}${T.wk ? `, KG ${fmt(T.mz / T.wk, 2)} m${T.wk < T.w ? ' (decks with known height only)' : ''}` : ''}</p></div>
  ${decks.map(d => `<h2 class="sh">${DECKNAME(d)}</h2><div class="card tblwrap"><table class="tbl stab"><thead><tr><th>Grp</th><th>Hold</th><th>POD/POL</th><th>Number of cars</th><th>Weight (t)</th><th>Mid.G (m)</th><th>KG (m)</th><th>TCG (m)</th><th>Note</th></tr></thead><tbody>
    ${rows.filter(r => r.d === d).map((r, i) => `<tr><td>${i + 1}</td><td>${r.h}</td><td><i class="dot" style="background:${colorOf(r.pod)}"></i>${esc(code(r.pod))}/${esc(r.pol ? code(r.pol) : '?')}</td><td>${fmt(r.n)}</td><td>${fmt(r.w, 1)}</td><td>${r.lcg == null ? '–' : fmt(r.lcg, 2)}</td><td>${r.kg == null ? '–' : fmt(r.kg, 2)}</td><td>${r.tcg == null ? '–' : fmt(r.tcg, 2)}</td><td class="muted">${esc(r.src)}</td></tr>`).join('')}
  </tbody></table></div>`).join('') || '<p class="muted">No cargo loaded yet.</p>'}`;
}
function stabCsv() {
  const rows = stabStacks(), L = [['Deck', 'Grp', 'Number of Cars', 'Weight (ton)', 'Mid. G (m)', 'KG (m)', 'TCG (m)', 'Note']];
  DECKS.forEach(d => rows.filter(r => r.d === d).forEach((r, i) => L.push([DECKNAME(d), i + 1, r.n, r.w.toFixed(1), r.lcg == null ? '' : r.lcg.toFixed(2), r.kg == null ? '' : r.kg.toFixed(2), r.tcg == null ? '' : r.tcg.toFixed(2), `H${r.h} ${code(r.pod)}/${r.pol ? code(r.pol) : '?'} ${r.src}`])));
  return L.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-stab]'); if (!b || b.tagName === 'INPUT') return;
  if (b.dataset.stab === 'pdf') { b.disabled = true; b.textContent = 'Creating PDF…'; buildStabPdf().then(p => { UI.pdfStab = p; rerender(); toast('Stability PDF created.'); }).catch(err => { console.error(err); toast('Could not create PDF: ' + err.message); b.disabled = false; b.textContent = 'Export to PDF'; }); }
});
document.addEventListener('change', e => { if (e.target.dataset.stab === 'defwt') { ship().stabDefWt = e.target.value; save(); rerender(); } });

/* =========================================================
   Deck plans PDF: all 12 decks, one per landscape page
   ========================================================= */
// Stability points as PDF: Deck 12 → Deck 1, Hold 4 → Hold 1, one table per deck
async function buildStabPdf() {
  const K = await pdfKit(), { sh, doc, AT, header, base, podCell, footer, fileBase } = K;
  const rows = stabStacks(), defW = sh.stabDefWt || '1.6';
  const T = rows.reduce((a, r) => { a.n += r.n; a.w += r.w; if (r.lcg != null) { a.mx += r.w * r.lcg; a.my += r.w * r.tcg; a.wl += r.w; } if (r.kg != null) { a.mz += r.w * r.kg; a.wk += r.w; } return a; }, { n: 0, w: 0, mx: 0, my: 0, wl: 0, mz: 0, wk: 0 });
  header('STABILITY – CARGO POINTS PER STACK');
  doc.setFontSize(9);
  doc.text(`Total cargo: ${fmt(T.n)} units, ${fmt(T.w, 1)} t${T.wl ? `, Mid.G ${fmt(T.mx / T.wl, 2)} m, TCG ${fmt(T.my / T.wl, 2)} m` : ''}${T.wk ? `, KG ${fmt(T.mz / T.wk, 2)} m` : ''}.   Weight per unit when not entered: ${defW} t.  KG = deck height + ${KG_ADD} m.`, 10, 27);
  let y = 32;
  for (const d of DECKS) {
    const list = rows.filter(r => r.d === d).sort((a, b) => b.h - a.h); if (!list.length) continue;
    if (y > 180) { doc.addPage(); header('STABILITY – CARGO POINTS PER STACK'); y = 26; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(DECKNAME(d), 10, y + 4); doc.setFont('helvetica', 'normal');
    AT({ ...base, startY: y + 6, head: [['Grp', 'Hold', 'POD/POL', 'Number of cars', 'Weight (t)', 'Mid.G (m)', 'KG (m)', 'TCG (m)', 'Note']],
      body: list.map((r, i) => [i + 1, r.h, { ...podCell(r.pod), content: `${code(r.pod)}/${r.pol ? code(r.pol) : '?'}` }, fmt(r.n), fmt(r.w, 1), r.lcg == null ? '-' : fmt(r.lcg, 2), r.kg == null ? '-' : fmt(r.kg, 2), r.tcg == null ? '-' : fmt(r.tcg, 2), r.src]),
      columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 14 }, 2: { cellWidth: 32 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } } });
    y = doc.lastAutoTable.finalY + 6;
  }
  if (!rows.length) doc.text('No cargo loaded.', 10, 40);
  footer();
  return { blob: doc.output('blob'), name: fileBase.replace('%', 'Stability') };
}
async function fileDataURL(name) { const r = await fetch(name); return blobToDataURL(await r.blob()); }
function svgToCanvas(svg, W, H) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H); URL.revokeObjectURL(url); res(cv); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('deck picture could not be drawn')); };
    img.src = url;
  });
}
const SVG_STYLE = `<style>.fig-lbl{font-weight:800;fill:#0e2036;paint-order:stroke;stroke:#fff;stroke-width:3px}.pnl-chg{stroke:#e00000;stroke-width:2.5;stroke-dasharray:5 4}.pnl-h{font-weight:800;fill:#c00000;paint-order:stroke;stroke:#fff;stroke-width:3px}.pnl-h.normal{fill:#0a6f9c}.pnl-h.mid{fill:#1b7f2a}.hstar{fill:#ffd400;stroke:#000;stroke-width:1.3}.selbox{fill:none}text{font-family:Helvetica,Arial,sans-serif}</style>`;
function holdSummary(d, h) {
  const sh = ship(), m = {};
  const add = (pod, pol, u, p, t) => { const k = `${code(pod)}/${pol ? code(pol) : '?'}`; const a = (m[k] ||= { u: 0, p: 0, t: 0 }); a.u += u; a.p += p; a.t += t; };
  if (d === 5) sh.deck5.shapes.filter(s => s.type !== 'ev' && shapeHold(s) === h).forEach(s => { if (s.type === 'mafi') { const t = mafiTotals(s); add(s.pod, s.pol, 0, t.pkgs, t.mt); } else if (s.type === 'pkg') add(s.pod, s.pol, 0, num(s.pkgs), num(s.mt) || num(s.wt) * num(s.pkgs)); else add(s.pod, s.pol, num(s.units), 0, num(s.wt) * num(s.units)); });
  else { const o = sh.holds[d + '-' + h]; if (o) o.entries.forEach(e => add(e.pod, e.pol, num(e.units), 0, num(e.wt) * num(e.units))); }
  return Object.entries(m).filter(([, a]) => a.u || a.p).map(([k, a]) => `${k}  ${a.u ? fmt(a.u) + ' Uts' : ''}${a.p ? (a.u ? ', ' : '') + fmt(a.p) + ' PKGs' : ''}${a.t ? '  ' + fmt(a.t, 1) + ' MT' : ''}`);
}
async function buildDecksPdf() {
  const K = await pdfKit(), { sh, doc, AT, header, base, footer, fileBase, img } = K;
  const cache = {}; const href = n => cache[n];
  const names = DECKS.flatMap(d => [`deck${d}.png`, `deck${d}-mask.png`]);
  for (const n of names) cache[n] = await fileDataURL(n);
  const keepSel = UI.d5.sel; UI.d5.sel = null;
  try {
    let first = true;
    for (const d of DECKS) {
      if (!first) doc.addPage(); first = false;
      header(`${DECKNAME(d).toUpperCase()}  (DECK ${d})   H ${deckH(d)}  @ ${DECKINFO[d].ax} t/axle  ${DECKINFO[d].kg} kg/m2`);
      const isD5 = d === 5, Wd = isD5 ? D5W : DECKPIC[d].w, Hd = isD5 ? D5H : DECKPIC[d].h, px = 2400, ph = Math.round(px * Hd / Wd), u = Wd / 1100;
      const body = isD5 ? d5BodySvg(u, { href }) : deckBodySvg(d, u, { href });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${ph}" viewBox="0 0 ${Wd} ${Hd}">${SVG_STYLE}${body}</svg>`;
      const cv = await svgToCanvas(svg, px, ph);
      const iw = 277, ih = Math.min(120, iw * Hd / Wd), y0 = 26;
      const usedW = ih * Wd / Hd; img(cv, 10, y0, 277, ih);
      // hold summaries under each hold, aligned with the picture
      const x0 = 10 + (277 - usedW) / 2, scale = usedW / Wd;
      const holds = isD5 ? D5HOLDS.map(z => ({ h: z.h, x0: z.x0, x1: z.x1 })) : deckHolds(d);
      const body2 = [holds.map(z => { const l = holdSummary(d, z.h); return l.length ? l.join('\n') : '–'; })];
      AT({ ...base, startY: y0 + ih + 4, margin: { left: x0, right: 297 - x0 - usedW }, tableWidth: usedW, head: [holds.map(z => `Hold ${z.h}`)], body: body2,
        columnStyles: Object.fromEntries(holds.map((z, i) => [i, { cellWidth: (z.x1 - z.x0) * scale }])), styles: { ...base.styles, fontSize: 8, valign: 'top' } });
    }
  } finally { UI.d5.sel = keepSel; }
  footer();
  return { blob: doc.output('blob'), name: fileBase.replace('%', 'Deck_Plans') };
}
