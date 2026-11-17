'use strict';
/* =========================================================
   Pre-Departure Stability Report (from the pre-loading booking file)
   STOWAGE SUMMARY  → every stack: deck, hold, POD, POL, units, weight
   SIMULATION PLAN  → where each stack sits (loading picture coloured by POL,
                      discharging picture coloured by POD, colours in legend order)
   Result per departure port: cargo total and No.1–4 car hold resultants
   (weight, Mid.G, KG, TCG), same method as the loading computer.
   Kept apart from the actual stability report.
   ========================================================= */
const HOLD_LIM = [48.88, -7.77, -51.03];          // hold lines in metres (aft → fwd)

// ---- STOWAGE SUMMARY sheet ----
function parseStowageSummary(rows) {
  const txt = v => (v == null ? '' : String(v).trim());
  let ldg = [], dis = [], voyage = '';
  rows.forEach(r => (r || []).forEach((v, i) => {
    const t = txt(v);
    if (/^LDG PORT/i.test(t)) ldg = txt(r.slice(i + 1).find(x => txt(x))).split('=>').map(s => s.trim()).filter(Boolean);
    if (/^DIS PORT/i.test(t)) dis = txt(r.slice(i + 1).find(x => txt(x))).split('=>').map(s => s.trim()).filter(Boolean);
    if (/^VOYAGE/i.test(t)) voyage = txt(r.slice(i + 1).find(x => txt(x)));
  }));
  const stacks = []; let block = [];
  const flush = () => {
    if (!block.length) return;
    let deck = null;
    block.forEach(r => (r || []).forEach(v => { const m = /^\[\s*(\d{1,2})\s*\]$/.exec(txt(v)); if (m) deck = +m[1]; }));
    if (deck) block.forEach(r => [0, 4, 8, 12].forEach((c, gi) => {
      const m = /^([A-Z0-9-]+)\s*<([^>]*)>$/.exec(txt(r[c])), p = /^\/\s*([A-Z0-9-]+)$/.exec(txt(r[c + 1]));
      if (m && p && num(r[c + 3]) > 0) stacks.push({ d: deck, h: 4 - gi, pod: m[1], fpod: m[2], pol: p[1], units: num(r[c + 2]), kg: num(r[c + 3]) });
    }));
    block = [];
  };
  rows.forEach(r => { if (!r || !r.some(v => txt(v))) flush(); else block.push(r); });
  flush();
  return stacks.length ? { ldg, dis, voyage, stacks } : null;
}
// Port rotation: loading list with the discharging ports merged in
function mergeRotation(ldg, dis) {
  const rot = [...ldg];
  dis.forEach((p, i) => {
    if (rot.includes(p)) return;
    const prev = dis.slice(0, i).reverse().find(q => rot.includes(q));
    rot.splice(prev ? rot.indexOf(prev) + 1 : rot.length, 0, p);
  });
  return rot;
}

// ---- pictures ----
function imgData(src, w, h) {
  return new Promise((res, rej) => {
    const i = new Image(); i.onload = () => { const W = w || i.naturalWidth, H = h || i.naturalHeight, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(i, 0, 0, W, H); res(c.getImageData(0, 0, W, H)); };
    i.onerror = () => rej(new Error('picture could not be read')); i.src = src;
  });
}
// Legend: one coloured port code per line → colour of each line, top to bottom
async function legendColours(src) {
  const im = await imgData(src), { width: W, height: H, data: p } = im, rows = [];
  for (let y = 0; y < H; y++) { const c = {}; let n = 0; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, r = p[i], g = p[i + 1], b = p[i + 2]; if (Math.max(r, g, b) - Math.min(r, g, b) > 60) { const k = r + ',' + g + ',' + b; c[k] = (c[k] || 0) + 1; n++; } } rows.push(n ? c : null); }
  const out = []; let cur = null;
  rows.forEach(c => { if (c) { cur ||= {}; for (const k in c) cur[k] = (cur[k] || 0) + c[k]; } else if (cur) { out.push(cur); cur = null; } });
  if (cur) out.push(cur);
  return out.map(c => Object.entries(c).sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number));
}
function holdOfM(d, m) {
  const k = m > HOLD_LIM[0] ? 4 : m > HOLD_LIM[1] ? 3 : m > HOLD_LIM[2] ? 2 : 1, hs = holdsFor(d);
  return hs.includes(k) ? k : hs.reduce((a, b) => (Math.abs(b - k) < Math.abs(a - k) ? b : a));
}
// For every deck: pixels where the loading colour is POL i and the discharging colour is POD j,
// summed per hold → centre in metres
async function stackCentres(PL, colL, colD) {
  const acc = {}, tol = 12, near = (r, g, b, cols) => { for (let k = 0; k < cols.length; k++) { const c = cols[k]; if (Math.abs(r - c[0]) <= tol && Math.abs(g - c[1]) <= tol && Math.abs(b - c[2]) <= tol) return k; } return -1; };
  for (const d of DECKS) {
    const sL = PL.load && PL.load[d], sD = PL.disch && PL.disch[d], B = DECKBOX[d], M = STABMAP[d]; if (!sL || !sD || !B || !M) continue;
    const L = await imgData(sL), D = await imgData(sD, L.width, L.height), W = L.width, H = L.height;
    for (let y = 0; y < H; y++) {
      const ym = lin(B[1] + (y + 0.5) / H * (B[3] - B[1]), M.y);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, li = near(L.data[i], L.data[i + 1], L.data[i + 2], colL); if (li < 0) continue;
        const di = near(D.data[i], D.data[i + 1], D.data[i + 2], colD); if (di < 0) continue;
        const xm = lin(B[0] + (x + 0.5) / W * (B[2] - B[0]), M.x), h = holdOfM(d, xm), k = `${d}|${h}|${li}|${di}`;
        const a = (acc[k] ||= { n: 0, x: 0, y: 0 }); a.n++; a.x += xm; a.y += ym;
        const k2 = `${d}|${h}|*|${di}`, b = (acc[k2] ||= { n: 0, x: 0, y: 0 }); b.n++; b.x += xm; b.y += ym;
      }
    }
  }
  return acc;
}
async function buildPredep(S0, PL, file) {
  const rot = mergeRotation(S0.ldg, S0.dis);
  let acc = {}, colL = [], colD = [];
  try {
    if (PL && PL.legend && PL.legend.load && PL.legend.disch) {
      colL = await legendColours(PL.legend.load); colD = await legendColours(PL.legend.disch);
      acc = await stackCentres(PL, colL.slice(0, S0.ldg.length), colD.slice(0, S0.dis.length));
    }
  } catch (e) { console.error(e); acc = {}; }
  const stacks = S0.stacks.map(s => {
    const li = S0.ldg.indexOf(s.pol), di = S0.dis.indexOf(s.pod), std = STAB_FULL[s.d] && STAB_FULL[s.d][s.h];
    const a = acc[`${s.d}|${s.h}|${li}|${di}`], b = acc[`${s.d}|${s.h}|*|${di}`];
    let lcg = std ? std[0] : 0, tcg = std ? std[1] : 0, src = 'standard hold centre';
    if (a && a.n >= 20) { lcg = a.x / a.n; tcg = a.y / a.n; src = 'plan'; }
    else if (b && b.n >= 20) { lcg = b.x / b.n; tcg = b.y / b.n; src = 'plan (POD area)'; }
    return { ...s, t: s.kg / 1000, lcg, tcg, kgm: deckKG(s.d), src };
  });
  const deps = rot.filter(p => S0.stacks.some(s => s.pol === p));
  return { file, date: new Date().toISOString(), voyage: S0.voyage, ldg: S0.ldg, dis: S0.dis, rot, deps, stacks };
}

// ---- results ----
function predepOnBoard(P, dep) {
  const i = P.rot.indexOf(dep);
  return P.stacks.filter(s => {
    const a = P.rot.indexOf(s.pol); if (a < 0 || a > i) return false;
    const rest = P.rot.slice(a + 1), b = rest.indexOf(s.pod);
    return b < 0 || a + 1 + b > i;
  });
}
function resultant(list) {
  const W = list.reduce((a, s) => a + s.t, 0), U = list.reduce((a, s) => a + s.units, 0);
  if (!W) return { u: U, w: 0, lcg: 0, kg: 0, tcg: 0 };
  return { u: U, w: W, lcg: list.reduce((a, s) => a + s.t * s.lcg, 0) / W, kg: list.reduce((a, s) => a + s.t * s.kgm, 0) / W, tcg: list.reduce((a, s) => a + s.t * s.tcg, 0) / W };
}
function predepRows(P, dep) {
  const on = predepOnBoard(P, dep);
  return [['Cargo Total', resultant(on)], ...[1, 2, 3, 4].map(h => [`No.${h} CAR HOLD`, resultant(on.filter(s => s.h === h))])];
}
const f2 = v => (Math.round(v * 100) / 100).toFixed(2), f1 = v => (Math.round(v * 10) / 10).toFixed(1);

function predepHtml() {
  const P = ship().predep;
  if (!P) return `<h2 class="sh">Pre-Departure Stability Report</h2><div class="card"><p class="muted">Import the pre-loading booking file in the Booking tab. The report is made from its STOWAGE SUMMARY and SIMULATION PLAN, for departure from every loading port.</p></div>`;
  const plan = P.stacks.filter(s => s.src !== 'standard hold centre').length;
  return `<h2 class="sh">Pre-Departure Stability Report</h2>
  <div class="card"><p class="muted">From booking file ${esc(P.file)}${P.voyage ? `, voyage ${esc(P.voyage)}` : ''}. Preliminary: booked weights, cargo only. Separate from the actual stability report. ${plan === P.stacks.length ? `All ${plan} stacks placed from the simulation plan.` : `${plan} of ${P.stacks.length} stacks placed from the simulation plan, the rest at the standard hold centre.`}</p>
    <button class="btn primary" data-pre="pdf">Export to PDF</button>
    ${UI.pdfPre ? `<div class="pdfready"><p><b>${esc(UI.pdfPre.name)}</b> is ready.</p><button class="btn primary" data-act="sharePdf" data-v="pdfPre">Email PDF</button><button class="btn" data-act="savePdf" data-v="pdfPre">Save to Files</button></div>` : ''}
  </div>
  ${P.deps.map(dep => `<div class="card tblwrap"><div class="sc-h"><b>Departure ${esc(dep)}</b><span class="muted small">on board: loaded ${esc(P.rot.slice(0, P.rot.indexOf(dep) + 1).filter(p => predepOnBoard(P, dep).some(s => s.pol === p)).join(', '))}</span></div>
    <table class="tbl predep"><thead><tr><th></th><th>Units</th><th>Weight (t)</th><th>Mid.G (m)</th><th>KG (m)</th><th>TCG (m)</th></tr></thead><tbody>
    ${predepRows(P, dep).map(([n, r], i) => `<tr class="${i ? '' : 'tot'}"><td>${n}</td><td>${fmt(r.u)}</td><td>${f1(r.w)}</td><td>${r.w ? f2(r.lcg) : '–'}</td><td>${r.w ? f2(r.kg) : '–'}</td><td>${r.w ? f2(r.tcg) : '–'}</td></tr>`).join('')}
    </tbody></table></div>`).join('')}`;
}
async function buildPredepPdf() {
  const P = ship().predep, K = await pdfKit(), { doc, AT, header, base, footer, fileBase } = K;
  // page header with the booking's own voyage and rotation (not the app's current voyage)
  const hdr = () => {
    header('PRE-DEPARTURE STABILITY REPORT (BOOKING)');
    doc.setFillColor(255, 255, 255); doc.rect(180, 5, 110, 7, 'F'); doc.rect(9, 18, 280, 4, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Booking voyage: ${P.voyage || '-'}`, 287, 10, { align: 'right' });
    doc.setFontSize(7); doc.text(P.rot.join(' => '), 10, 21);
  };
  hdr();
  doc.setFontSize(8.5);
  doc.text(`Booking file: ${P.file}.   Preliminary calculation from booked weights, cargo only. KG = deck height + ${KG_ADD} m.`, 10, 27);
  let y = 31;
  P.deps.forEach(dep => {
    if (y > 165) { doc.addPage(); hdr(); y = 26; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(`Departure ${dep}`, 10, y + 4); doc.setFont('helvetica', 'normal');
    AT({ ...base, startY: y + 6, tableWidth: 180, head: [['', 'Units', 'Weight (t)', 'Mid.G (m)', 'KG (m)', 'TCG (m)']],
      body: predepRows(P, dep).map(([n, r], i) => [i ? n : { content: n, styles: { fontStyle: 'bold' } }, fmt(r.u), i ? f1(r.w) : { content: f1(r.w), styles: { fillColor: [146, 208, 80], fontStyle: 'bold' } }, r.w ? f2(r.lcg) : '-', r.w ? f2(r.kg) : '-', r.w ? f2(r.tcg) : '-']),
      columnStyles: { 0: { cellWidth: 45 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } });
    y = doc.lastAutoTable.finalY + 5;
  });
  footer();
  return { blob: doc.output('blob'), name: `${ship().short || 'SHIP'}-Pre-Departure_Stability_VOY_${(P.voyage || '').replace(/[^A-Za-z0-9]+/g, '') || 'NA'}.pdf` };
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pre]'); if (!b) return;
  if (b.dataset.pre === 'pdf') { b.disabled = true; b.textContent = 'Creating PDF…'; buildPredepPdf().then(p => { UI.pdfPre = p; rerender(); toast('Pre-departure PDF created.'); }).catch(err => { console.error(err); toast('Could not create PDF: ' + err.message); b.disabled = false; b.textContent = 'Export to PDF'; }); }
});
