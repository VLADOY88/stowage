'use strict';
/* =========================================================
   Pre-loading plan (Excel import), booking list, lashing
   ========================================================= */

/* ---------- Lashing (K Line rule: Required = Weight x 1.2 / SWL, even number) ---------- */
const LASH = [
  { k: 'b6', name: 'BL 6T belt', sh: '6T belt', swl: 1.5, ok: [5, 25], grey: [30, 40], c: '#bdf2fb' },
  { k: 'b10', name: 'BL 10T belt', sh: '10T belt', swl: 2.5, ok: [15, 60], grey: [65, 80], c: '#ffff4d' },
  { k: 'b16', name: 'BL 16T belt', sh: '16T belt', swl: 4.0, ok: [20, 80], grey: [85, 100], c: '#8fd14f' },
  { k: 'c15', name: 'BL 15T chain', sh: '15T chain', swl: 3.75, ok: [20, 100], grey: [105, 125], c: '#ff99cc' },
  { k: 'c20', name: 'BL 20T chain', sh: '20T chain', swl: 5.0, ok: [20, 125], grey: null, c: '#ffc000' }
];
// K Line rule only: Required number = cargo weight (t) x 1.2 / SWL, rounded up to the next even number (equal on both sides).
// BL 20T chain is shown for information only (no longer used; only if nothing else is available).
function lashing(wt) {
  wt = num(wt); if (wt < 5) return null;
  return LASH.map(t => ({ ...t, n: 2 * Math.ceil(wt * 1.2 / t.swl / 2 - 1e-9), st: t.k === 'c20' ? 'last' : 'ok' }));
}
// Chosen material: the preferred one if set, otherwise the fewest lashings — never BL 20T chain
function lashPick(wt, pref) {
  const L = lashing(wt); if (!L) return null;
  const usable = L.filter(x => x.k !== 'c20');
  return (pref && pref !== 'auto' && usable.find(x => x.k === pref)) || usable.reduce((a, b) => (b.n < a.n ? b : a));
}
function lashHintHtml(wt, units) {
  const L = lashing(wt); if (!L) return '';
  const pick = lashPick(wt, ship().lashPref), u = num(units), c20 = L.find(x => x.k === 'c20');
  const alts = L.filter(x => x.k !== pick.k && x.k !== 'c20').map(x => `${x.n}× ${x.sh}`).join(', ');
  return `<div class="lash-hint"><b>≥5 MT, ${fmt(num(wt), 2)} t:</b> ${pick.n}× ${esc(pick.sh)} per unit${u > 1 ? `, <b>${pick.n * u} total</b> for ${fmt(u)} units` : ''}${alts ? `<br><span class="muted">Or: ${esc(alts)}</span>` : ''}<br><span class="muted">20T chain: ${c20.n} (only if no other material)</span></div>`;
}
function lashTableHtml(wt, units) {
  const L = lashing(wt);
  if (!L) return num(wt) > 0 ? `<p class="muted">Under 5 MT: standard lashing.</p>` : '';
  const pick = lashPick(wt, ship().lashPref), u = num(units);
  return `<table class="tbl lash"><thead><tr><th>Material</th><th>SWL</th><th>Per unit</th>${u > 1 ? '<th>Total</th>' : ''}<th>Use</th></tr></thead><tbody>
    ${L.map(x => `<tr class="${x.k === 'c20' ? 'no' : ''}${x.k === pick.k ? ' pick' : ''}"><td><i class="dot" style="background:${x.c}"></i>${x.name}</td><td>${x.swl} t</td><td><b>${x.n}</b></td>${u > 1 ? `<td>${x.n * u}</td>` : ''}<td>${x.k === pick.k ? 'Chosen' : x.k === 'c20' ? 'Only if nothing else' : ''}</td></tr>`).join('')}
    </tbody></table><p class="hint">${fmt(num(wt), 2)} t × 1.2 ÷ SWL, rounded up to an even number.</p>`;
}
// Every loaded item with a weight per unit of 5 t or more
function heavyLoaded(sh = ship()) {
  const out = [];
  for (const k in sh.holds) {
    const [d, h] = k.split('-').map(Number);
    sh.holds[k].entries.forEach(e => { if (num(e.wt) >= 5) out.push({ deck: d, hold: h, pod: e.pod, pol: e.pol, model: e.brand || '', units: num(e.units), wt: num(e.wt) }); });
  }
  sh.deck5.shapes.forEach(s => { if ((s.type === 'rect' || s.type === 'free' || s.type === 'pkg') && num(s.wt) >= 5) out.push({ deck: 5, hold: shapeHold(s), pod: s.pod, pol: s.pol, model: s.label || (s.type === 'pkg' ? 'Package' : ''), units: s.type === 'pkg' ? num(s.pkgs) : num(s.units), wt: num(s.wt) }); });
  return out.map(r => ({ ...r, pick: lashPick(r.wt, sh.lashPref) }));
}

/* ---------- Plan pictures (kept apart from the main data: they are large) ---------- */
let PLAN = null; // { file, date, load: {deck: dataURL}, disch: {deck: dataURL} }
async function loadPlanImages() { try { PLAN = (await dbGet('plan-' + ship().id)) || null; } catch (e) { PLAN = null; } }
// Hull outline box of each app deck picture (pixels; deck 5 in deck-5 units)
const DECKBOX = { 12: [2, 50, 978, 252], 11: [0, 18, 1403, 279], 10: [0, 17, 1404, 278], 9: [1, 18, 1404, 278], 8: [1, 18, 1405, 277], 7: [0, 18, 1404, 276], 6: [3, 17, 1393, 278], 5: [0, 26, 993, 273], 4: [1, 18, 937, 279], 3: [1, 18, 854, 278], 2: [1, 18, 702, 278], 1: [0, 19, 699, 282] };
function planImageSvg(d) {
  const v = UI.planView; if (!PLAN || !v || v === 'off') return '';
  const src = PLAN[v] && PLAN[v][d], b = DECKBOX[d]; if (!src || !b) return '';
  return `<image href="${src}" x="${b[0]}" y="${b[1]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}" preserveAspectRatio="none" opacity="${UI.planOpacity || 0.8}" class="plan-blend"/>`;
}
function planToggleHtml() {
  if (!PLAN) return '';
  const v = UI.planView || 'off';
  return `<div class="seg plan-seg" aria-label="Pre-loading plan">${[['off', 'Plan off'], ['load', 'Plan: loading'], ['disch', 'Plan: discharging']].map(([k, n]) => `<button data-pact="view" data-v="${k}" class="${v === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
}

/* ---------- Excel reading (offline, JSZip) ---------- */
function loadJSZip() { return window.JSZip ? Promise.resolve() : loadScript('jszip.min.js'); }
const xmlDoc = t => new DOMParser().parseFromString(t, 'application/xml');
const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref)[1]; let n = 0; for (const ch of m) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const relPath = (base, target) => { if (target.startsWith('/')) return target.slice(1); const parts = base.split('/'); parts.pop(); for (const p of target.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); } return parts.join('/'); };
async function readRels(zip, path) {
  const dir = path.split('/'); const f = dir.pop(); const rp = [...dir, '_rels', f + '.rels'].join('/');
  const file = zip.file(rp); if (!file) return {};
  const doc = xmlDoc(await file.async('string')), out = {};
  [...doc.getElementsByTagName('Relationship')].forEach(r => { out[r.getAttribute('Id')] = relPath(path, r.getAttribute('Target')); });
  return out;
}
async function readWorkbook(file) {
  await loadJSZip();
  const zip = await JSZip.loadAsync(file);
  const wbDoc = xmlDoc(await zip.file('xl/workbook.xml').async('string')), wbRels = await readRels(zip, 'xl/workbook.xml');
  const sheets = [...wbDoc.getElementsByTagName('sheet')].map(s => ({ name: s.getAttribute('name'), path: wbRels[s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')] }));
  let ss = [];
  if (zip.file('xl/sharedStrings.xml')) ss = [...xmlDoc(await zip.file('xl/sharedStrings.xml').async('string')).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
  return { zip, sheets, ss };
}
async function sheetRows(W, sheet) {
  const doc = xmlDoc(await W.zip.file(sheet.path).async('string')), rows = [];
  [...doc.getElementsByTagName('row')].forEach(r => {
    const i = +r.getAttribute('r') - 1, arr = [];
    [...r.getElementsByTagName('c')].forEach(c => {
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], is = c.getElementsByTagName('is')[0];
      let val = v ? v.textContent : is ? [...is.getElementsByTagName('t')].map(x => x.textContent).join('') : null;
      if (val != null) { if (t === 's') val = W.ss[+val]; else if (t !== 'str' && t !== 'inlineStr' && t !== 'b' && val !== '' && !isNaN(+val)) val = +val; }
      arr[colIdx(c.getAttribute('r'))] = val;
    });
    rows[i] = arr;
  });
  return rows;
}
// Pictures placed on a sheet: [{col,row,media}]
async function sheetPictures(W, sheet) {
  const rels = await readRels(W.zip, sheet.path), out = [];
  for (const id in rels) {
    if (!/drawings\/drawing\d+\.xml$/.test(rels[id])) continue;
    const dPath = rels[id], dRels = await readRels(W.zip, dPath), doc = xmlDoc(await W.zip.file(dPath).async('string'));
    const anchors = [...doc.getElementsByTagNameNS('*', 'twoCellAnchor'), ...doc.getElementsByTagNameNS('*', 'oneCellAnchor')];
    anchors.forEach(a => {
      const pic = a.getElementsByTagNameNS('*', 'pic')[0]; if (!pic) return;
      const blip = pic.getElementsByTagNameNS('*', 'blip')[0]; if (!blip) return;
      const emb = blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
      const from = a.getElementsByTagNameNS('*', 'from')[0];
      out.push({ col: +from.getElementsByTagNameNS('*', 'col')[0].textContent, row: +from.getElementsByTagNameNS('*', 'row')[0].textContent, media: dRels[emb] });
    });
  }
  return out;
}
// "SHA:SHANGHAI" legends in text boxes give port names
async function legendNames(W) {
  const names = {};
  for (const f of Object.keys(W.zip.files).filter(n => /^xl\/drawings\/drawing\d+\.xml$/.test(n))) {
    const doc = xmlDoc(await W.zip.file(f).async('string'));
    [...doc.getElementsByTagNameNS('*', 't')].forEach(t => { const m = /^\s*([A-Z0-9]{2,5}(?:-\d)?)\s*:\s*([A-Z][A-Z .'-]+)\s*$/.exec(t.textContent); if (m) names[m[1]] = m[2].trim(); });
  }
  return names;
}
// Crop a simulation picture to its hull lines (the deck label on the right is left out)
function cropPlanPicture(blob) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(blob);
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0); const px = ctx.getImageData(0, 0, W, H).data;
      const lim = Math.round(W * 0.834); let x0 = W, x1 = 0; const rowCount = new Array(H).fill(0);
      for (let y = 0; y < H; y++) for (let x = 0; x < lim; x++) {
        const i = (y * W + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2];
        if ((b > r + 40 && b > g + 20) || (r < 100 && g < 100 && b < 100)) { if (x < x0) x0 = x; if (x > x1) x1 = x; rowCount[y]++; }
      }
      const ys = rowCount.map((c, y) => (c > 40 ? y : -1)).filter(y => y >= 0);
      if (x1 <= x0 || !ys.length) { URL.revokeObjectURL(url); return res(null); }
      const y0 = ys[0], y1 = ys[ys.length - 1], out = document.createElement('canvas');
      out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
      out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      URL.revokeObjectURL(url); res(out.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('picture could not be read')); };
    img.src = url;
  });
}
async function parsePreplan(file) {
  const W = await readWorkbook(file), result = { file: file.name, booking: null, pics: null, names: await legendNames(W) };
  // Booking list
  const bSheet = W.sheets.find(s => /BOOKING/i.test(s.name));
  if (bSheet) {
    const rows = await sheetRows(W, bSheet), hi = rows.findIndex(r => r && r.includes('LPORT') && r.includes('DPORT'));
    if (hi >= 0) {
      const H = rows[hi].map(x => (x == null ? '' : String(x).trim())), c = n => H.indexOf(n), g = (r, n) => (c(n) >= 0 ? r[c(n)] : null);
      const voyRow = rows.slice(0, hi).find(r => r && r.some(x => /voyage/i.test(String(x || ''))));
      result.voyage = voyRow ? String(voyRow[voyRow.findIndex(x => /voyage/i.test(String(x || ''))) + 1] || '').trim() : '';
      result.booking = rows.slice(hi + 1).filter(r => r && g(r, 'LPORT') && num(g(r, 'Units')) > 0).map(r => ({
        l: String(g(r, 'LPORT')).trim(), d: String(g(r, 'DPORT') || '').trim(), pod: String(g(r, 'POD') || '').trim(),
        maker: String(g(r, 'Maker') || '').trim(), model: String(g(r, 'Model') || '').trim(), shipper: String(g(r, 'Shipper') || '').trim(),
        units: num(g(r, 'Units')), len: num(g(r, 'Length')), wid: num(g(r, 'Width')), hgt: num(g(r, 'Height')), kg: num(g(r, 'Weight')),
        ev: /^y/i.test(String(g(r, 'EV') || '')), type: String(g(r, 'Type') || '').trim(), st: /^y/i.test(String(g(r, 'Static Cargo') || '')),
        mafi: num(g(r, 'Num.MAFI')), bid: String(g(r, 'Booking ID') || '').trim()
      }));
    }
  }
  // Simulation plan pictures: left block "Loading", right block "Discharging", decks 12 → 1 from top
  const sSheet = W.sheets.find(s => /SIMULATION/i.test(s.name));
  if (sSheet) {
    const rows = await sheetRows(W, sSheet); let lc = 1, dc = 16;
    rows.forEach(r => (r || []).forEach((v, i) => { if (/^\s*loading\s*$/i.test(String(v || ''))) lc = i; if (/^\s*discharging\s*$/i.test(String(v || ''))) dc = i; }));
    const pics = await sheetPictures(W, sSheet), big = [];
    for (const p of pics) { const f = W.zip.file(p.media); if (!f) continue; const blob = await f.async('blob'); const dim = await imgSize(blob); if (dim.w >= 800 && dim.w > dim.h * 3) big.push({ ...p, blob }); }
    const mid = (lc + dc) / 2, groups = { load: big.filter(p => p.col < mid), disch: big.filter(p => p.col >= mid) };
    result.pics = { load: {}, disch: {} }; result.picCount = big.length;
    for (const k of ['load', 'disch']) {
      const list = groups[k].sort((a, b) => a.row - b.row);
      for (let i = 0; i < list.length && i < DECKS.length; i++) result.pics[k][DECKS[i]] = await cropPlanPicture(list[i].blob);
    }
  }
  return result;
}
function imgSize(blob) { return new Promise(res => { const i = new Image(), u = URL.createObjectURL(blob); i.onload = () => { res({ w: i.naturalWidth, h: i.naturalHeight }); URL.revokeObjectURL(u); }; i.onerror = () => { res({ w: 0, h: 0 }); URL.revokeObjectURL(u); }; i.src = u; }); }

/* ---------- Port code matching ---------- */
function guessPort(codeStr, name) {
  const ps = ship().ports, c = codeStr.toUpperCase(), base = c.replace(/-\d$/, ''), flat = c.replace('-', '');
  return (ps.find(p => p.code === c) || ps.find(p => p.code === flat) || (/-1$/.test(c) && ps.find(p => p.code === base)) ||
    (name && ps.find(p => p.name.toUpperCase().replace(/[^A-Z]/g, '') === name.toUpperCase().replace(/[^A-Z]/g, '') && (!/-2$/.test(c) || /2/.test(p.code)))) ||
    (name && ps.find(p => p.name.toUpperCase().startsWith(name.toUpperCase().slice(0, 5)) && (!/-2$/.test(c) || /2/.test(p.code)))) || null);
}
function mappingDialog(R) {
  const lp = [...new Set(R.booking.map(r => r.l))], dp = [...new Set(R.booking.map(r => r.d).filter(Boolean))];
  const codes = [...new Set([...lp, ...dp])], old = (ship().booking && ship().booking.map) || {};
  const opts = (sel) => `<option value="">Ignore</option><option value="__new" ${sel === '__new' ? 'selected' : ''}>Add as new port</option>${ship().ports.map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.code)} – ${esc(p.name)}</option>`).join('')}`;
  const rowsHtml = codes.map(c => { const g = old[c] && P(old[c]) ? old[c] : (guessPort(c, R.names[c])?.id || '__new'); return `<tr><td><b>${esc(c)}</b><br><span class="muted">${esc(R.names[c] || '')}</span></td><td>${lp.includes(c) ? 'L' : ''}${lp.includes(c) && dp.includes(c) ? '+' : ''}${dp.includes(c) ? 'D' : ''}</td><td><select data-map="${esc(c)}">${opts(g)}</select></td></tr>`; }).join('');
  return modal(`<h3 class="ch">Match ports</h3><p class="muted">${R.booking.length} booking lines${R.picCount ? `, ${R.picCount} plan pictures` : ''}. Match each code in the file to a port in the app.</p>
    <div class="map-wrap"><table class="tbl map"><thead><tr><th>In file</th><th>Use</th><th>Port in app</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    <label class="chk"><input type="checkbox" id="mFill" checked> Fill "Expected units / PKGs" in the Summary</label>
    <div class="modal-btns"><button class="btn" data-v="0">Cancel</button><button class="btn primary" data-v="1">Import</button></div>`,
    (ov, done) => ov.addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      if (b.dataset.v === '0') return done(null);
      const map = {}; $$('[data-map]', ov).forEach(s => { map[s.dataset.map] = s.value; });
      done({ map, fill: $('#mFill', ov).checked, lp, dp });
    }));
}
async function importPreplan(file) {
  const sh = ship();
  toast('Reading ' + file.name + '…', 6000);
  let R; try { R = await parsePreplan(file); } catch (e) { console.error(e); toast('Could not read the file: ' + e.message, 5000); return; }
  if (!R.booking && !R.pics) { toast('No BOOKING LIST or SIMULATION PLAN found in this file.', 5000); return; }
  let M = { map: {}, fill: false };
  if (R.booking && R.booking.length) { M = await mappingDialog(R); if (!M) return; }
  // create new ports where asked
  for (const c in M.map) {
    if (M.map[c] !== '__new') continue;
    const isL = M.lp.includes(c), isD = M.dp.includes(c), nm = R.names[c] ? R.names[c].replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase()) : c;
    const p = { id: uid(), locode: '', name: nm, code: uniqueCode(c.replace('-', '')), type: isL && isD ? 'LD' : isL ? 'L' : 'D', color: isD ? nextColor() : null, expUnits: '', expPkgs: '' };
    sh.ports.push(p); M.map[c] = p.id;
  }
  // a port used for discharging in the booking must be able to carry a colour
  M.dp.forEach(c => { const p = M.map[c] && P(M.map[c]); if (p && p.type === 'L') { p.type = 'LD'; if (!p.color) p.color = nextColor(); } });
  if (R.booking) {
    sh.booking = { file: R.file, date: new Date().toISOString(), voyage: R.voyage || '', rows: R.booking, map: M.map };
    if (M.fill) loadPorts().forEach(p => { const b = bookedFor(p.id); if (b.rows.length) { p.expUnits = String(b.units); p.expPkgs = String(b.pkgs); } });
  }
  if (R.pics && Object.keys(R.pics.load).length + Object.keys(R.pics.disch).length) {
    PLAN = { file: R.file, date: new Date().toISOString(), load: R.pics.load, disch: R.pics.disch };
    try { await dbSet('plan-' + sh.id, PLAN); } catch (e) { toast('Plan pictures could not be stored: ' + e.message); }
    UI.planView = 'load';
  }
  save(); rerender();
  toast(`Imported${R.booking ? ' ' + R.booking.length + ' booking lines' : ''}${R.pics ? ', plan pictures for ' + Object.keys(R.pics.load).length + ' decks' : ''}.`, 5000);
}

/* ---------- Booking figures ---------- */
const bkPort = c => { const b = ship().booking; const id = b && b.map[c]; return id && id !== '__new' && P(id) ? id : null; };
function bookedFor(polId, podId) {
  const b = ship().booking, rows = b ? b.rows.filter(r => bkPort(r.l) === polId && (!podId || bkPort(r.d) === podId)) : [];
  return { rows, units: rows.filter(r => !r.st).reduce((a, r) => a + r.units, 0), pkgs: rows.filter(r => r.st).reduce((a, r) => a + r.units, 0), ev: rows.filter(r => r.ev).reduce((a, r) => a + r.units, 0), mafi: rows.reduce((a, r) => a + r.mafi, 0), heavy: rows.filter(r => r.kg >= 5000) };
}
function brandOptions(polId) {
  const b = ship().booking; if (!b) return [];
  const rows = b.rows.filter(r => !polId || bkPort(r.l) === polId);
  return [...new Set(rows.map(r => `${r.maker} ${r.model}`.trim()))].sort();
}
function bookingWeight(brand, polId) {
  const b = ship().booking; if (!b || !brand) return null;
  const t = brand.trim().toUpperCase(), r = b.rows.find(x => `${x.maker} ${x.model}`.trim().toUpperCase() === t && (!polId || bkPort(x.l) === polId)) || b.rows.find(x => `${x.maker} ${x.model}`.trim().toUpperCase() === t);
  return r ? r.kg / 1000 : null;
}

/* ---------- Plan tab ---------- */
function tabPlanHtml() {
  const sh = ship(), b = sh.booking, rows = cargoRows(sh), q = UI.bkQuery || '';
  const imp = `<div class="card">
    <h2 class="ch">Pre-loading plan</h2>
    <p class="muted">${b || PLAN ? `Imported: ${esc((b && b.file) || (PLAN && PLAN.file) || '')}${b ? `, ${b.rows.length} booking lines` : ''}${PLAN ? ', plan pictures' : ''}.` : 'Import the planner\'s Excel file (SIMULATION PLAN and BOOKING LIST). Works offline.'}</p>
    <label class="btn primary filebtn">Import Excel file (.xlsx)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" id="preplanFile" hidden></label>
    ${b || PLAN ? `<button class="btn danger" data-pact="clear">Remove imported plan</button>` : ''}
    ${PLAN ? `<p class="hint">In every deck screen use <b>Plan: loading</b> or <b>Plan: discharging</b> to show the planner's picture under your painting.</p><label class="fld"><span>Plan picture strength</span><input type="range" min="0.3" max="1" step="0.05" value="${UI.planOpacity || 0.8}" data-pact="opacity"></label>` : ''}
  </div>`;
  let booked = '';
  if (b) {
    booked = `<h2 class="sh">Booked vs loaded</h2>` + loadPorts().map(p => {
      const bk = bookedFor(p.id); if (!bk.rows.length) return '';
      const mine = rows.filter(r => r.pol === p.id), act = sumRows(mine);
      const pods = [...new Set([...bk.rows.map(r => bkPort(r.d)).filter(Boolean), ...mine.map(r => r.pod)])];
      const evLoaded = Object.values(sh.holds).reduce((a, o) => a + (o.evs || []).filter(v => v[2] === p.id).length, 0) + sh.deck5.shapes.filter(s => s.type === 'ev' && s.pol === p.id).length;
      const mafiLoaded = sh.deck5.shapes.filter(s => s.type === 'mafi' && s.pol === p.id).reduce((a, s) => a + s.mafis.length, 0);
      const cls = (x, y) => (!x && !y ? '' : x === y ? 'ok' : x > y ? 'over' : '');
      return `<details class="card pol-group" ${p.id === sh.activePol ? 'open' : ''}><summary>${esc(p.name)} (${esc(p.code)}): booked ${fmt(bk.units)} units, ${fmt(bk.pkgs)} PKGs; loaded ${fmt(act.units)} / ${fmt(act.pkgs)}</summary>
        <table class="tbl"><thead><tr><th>POD</th><th>Booked units</th><th>Loaded</th><th>Booked PKGs</th><th>Loaded</th></tr></thead><tbody>
        ${pods.map(pod => { const bb = bookedFor(p.id, pod), a = sumRows(mine.filter(r => r.pod === pod)); return `<tr><td><i class="dot" style="background:${colorOf(pod)}"></i>${esc(code(pod))}</td><td>${fmt(bb.units)}</td><td class="${cls(a.units, bb.units)}">${fmt(a.units)}</td><td>${fmt(bb.pkgs)}</td><td class="${cls(a.pkgs, bb.pkgs)}">${fmt(a.pkgs)}</td></tr>`; }).join('')}
        </tbody><tfoot><tr><td>Total</td><td>${fmt(bk.units)}</td><td class="${cls(act.units, bk.units)}">${fmt(act.units)}</td><td>${fmt(bk.pkgs)}</td><td class="${cls(act.pkgs, bk.pkgs)}">${fmt(act.pkgs)}</td></tr></tfoot></table>
        <p class="muted small">EV booked ${fmt(bk.ev)}, EV marks placed ${evLoaded}. MAFIs booked ${fmt(bk.mafi)}, on Deck 5 ${mafiLoaded}. Units ≥5 MT booked: ${fmt(bk.heavy.reduce((a, r) => a + r.units, 0))}.</p></details>`;
    }).join('');
  }
  const pref = sh.lashPref || 'auto';
  const lashCalc = `<h2 class="sh">Lashing for units ≥ 5 MT</h2>${lashCalcCard()}`;
  const hv = heavyLoaded(sh), tot = {}; hv.forEach(r => { tot[r.pick.k] = (tot[r.pick.k] || 0) + r.pick.n * r.units; });
  const heavyLoadedHtml = `<div class="card"><h2 class="ch">Loaded units ≥ 5 MT</h2>
    ${hv.length ? `<div class="tblwrap"><table class="tbl wrap"><thead><tr><th>Deck/Hold</th><th>POD/POL</th><th>Model</th><th>Units</th><th>t</th><th>Lashing per unit</th><th>Total</th></tr></thead><tbody>
    ${hv.map(r => `<tr><td>DK${r.deck} H${r.hold}</td><td><i class="dot" style="background:${colorOf(r.pod)}"></i>${esc(code(r.pod))}/${esc(code(r.pol))}</td><td>${esc(r.model || '–')}</td><td>${fmt(r.units)}</td><td>${fmt(r.wt, 1)}</td><td>${r.pick.n}× ${esc(r.pick.sh)}</td><td><b>${r.pick.n * r.units}</b></td></tr>`).join('')}
    </tbody></table></div><p><b>Totals:</b> ${LASH.filter(t => tot[t.k]).map(t => `${tot[t.k]}× ${t.name}`).join(', ')}</p>` : '<p class="muted">Enter the weight per unit (t) in a unit line, or pick a model from the booking list, and units of 5 t or more appear here with their lashing.</p>'}</div>`;
  let bookedHeavy = '';
  if (b) {
    const hb = b.rows.filter(r => r.kg >= 5000 && bkPort(r.l)).sort((x, y) => sh.ports.findIndex(p => p.id === bkPort(x.l)) - sh.ports.findIndex(p => p.id === bkPort(y.l)) || y.kg - x.kg);
    if (hb.length) {
      const pols = [...new Set(hb.map(r => bkPort(r.l)))];
      bookedHeavy = `<div class="card"><h2 class="ch">Booked units ≥ 5 MT</h2>${pols.map(pid => {
        const list = hb.filter(r => bkPort(r.l) === pid), tt = {};
        list.forEach(r => { const pk = lashPick(r.kg / 1000, pref); tt[pk.k] = (tt[pk.k] || 0) + pk.n * r.units; });
        return `<details class="pol-group" ${pid === sh.activePol ? 'open' : ''}><summary>${esc(P(pid).name)} (${esc(code(pid))}): ${fmt(list.reduce((a, r) => a + r.units, 0))} units, ${LASH.filter(t => tt[t.k]).map(t => `${tt[t.k]}× ${t.sh}`).join(', ')}</summary>
        <div class="tblwrap"><table class="tbl wrap"><thead><tr><th>POD</th><th>Maker / model</th><th>Units</th><th>t</th><th>Per unit</th><th>Total</th></tr></thead><tbody>
        ${list.map(r => { const pk = lashPick(r.kg / 1000, pref); return `<tr><td>${esc(bkPort(r.d) ? code(bkPort(r.d)) : r.d)}</td><td>${esc(r.maker)} ${esc(r.model)}</td><td>${fmt(r.units)}</td><td>${fmt(r.kg / 1000, 1)}</td><td>${pk.n}× ${esc(pk.sh)}</td><td><b>${pk.n * r.units}</b></td></tr>`; }).join('')}
        </tbody></table></div></details>`; }).join('')}</div>`;
    }
  }
  let search = '';
  if (b) {
    const t = q.trim().toUpperCase(), res = t.length < 2 ? [] : b.rows.filter(r => `${r.maker} ${r.model} ${r.bid} ${r.l} ${r.d} ${r.pod} ${r.shipper}`.toUpperCase().includes(t)).slice(0, 60);
    search = `<h2 class="sh">Booking list</h2><div class="card"><label class="fld"><span>Search maker, model, booking ID or port</span><input id="bkSearch" value="${esc(q)}" autocomplete="off" autocorrect="off" spellcheck="false"></label>
      <div id="bkRes">${bookingResults(res, t)}</div></div>`;
  }
  return imp + lashCalc + heavyLoadedHtml + bookedHeavy + booked + search;
}
function bookingResults(res, t) {
  if (!t || t.length < 2) return '<p class="muted">Type at least 2 letters.</p>';
  if (!res.length) return '<p class="muted">No match.</p>';
  return `<div class="tblwrap"><table class="tbl bk"><thead><tr><th>POL→DPORT</th><th>Maker / model</th><th>Units</th><th>L×W×H cm</th><th>t</th><th>Info</th></tr></thead><tbody>
    ${res.map(r => `<tr><td>${esc(r.l)}→${esc(r.d)}${r.pod && r.pod !== r.d ? ` (${esc(r.pod)})` : ''}</td><td>${esc(r.maker)} ${esc(r.model)}<br><span class="muted">${esc(r.bid)}</span></td><td>${fmt(r.units)}</td><td>${fmt(r.len)}×${fmt(r.wid)}×${fmt(r.hgt)}</td><td>${fmt(r.kg / 1000, 2)}</td><td>${[r.ev ? 'EV' : '', r.st ? 'Static' : '', r.mafi ? 'MAFI ' + r.mafi : '', r.kg >= 5000 ? '≥5 MT' : ''].filter(Boolean).join(', ')}</td></tr>`).join('')}
    </tbody></table></div>`;
}
function lashCalcCard() {
  const pref = ship().lashPref || 'auto';
  return `<div class="card">
    <p class="muted">Required number = cargo weight × 1.2 / SWL (K Line rule), rounded up to an even number (equal on both sides).</p>
    <div class="grid2"><label class="fld"><span>Weight per unit (t)</span><input inputmode="decimal" id="lashW" value="${esc(UI.lashW || '')}" placeholder="e.g. 27.8"></label>
    <label class="fld"><span>Number of units</span><input inputmode="numeric" id="lashU" value="${esc(UI.lashU || '')}" placeholder="1"></label></div>
    <label class="fld"><span>Preferred material</span><select data-pact="pref"><option value="auto" ${pref === 'auto' ? 'selected' : ''}>Fewest lashings (auto)</option>${LASH.filter(t => t.k !== 'c20').map(t => `<option value="${t.k}" ${pref === t.k ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
    <div id="lashOut">${lashTableHtml(UI.lashW, UI.lashU)}</div>
  </div>`;
}
function bindLashCalc() {
  const upd = () => { $('#lashOut').innerHTML = lashTableHtml(UI.lashW, UI.lashU); };
  const w = $('#lashW'), u = $('#lashU');
  if (w) w.oninput = () => { UI.lashW = w.value; upd(); };
  if (u) u.oninput = () => { UI.lashU = u.value; upd(); };
}
function renderLash() {
  app.innerHTML = `<header class="top"><button class="ic" data-act="home" aria-label="Back">${I.back}</button><div class="ttl"><b>Lashing calculator</b><span>Units of 5 MT and over</span></div></header>
  <main class="lash-main">${lashCalcCard()}
  <div class="card"><h2 class="ch">Lashing materials</h2><table class="tbl"><thead><tr><th>Material</th><th>Breaking load</th><th>SWL</th></tr></thead><tbody>
  ${LASH.map(t => `<tr class="${t.k === 'c20' ? 'no' : ''}"><td><i class="dot" style="background:${t.c}"></i>${t.name}</td><td>${t.name.match(/\d+/)[0]} t</td><td>${t.swl} t</td></tr>`).join('')}
  </tbody></table><p class="hint">SWL = ¼ of breaking load (CSS Code annex 13). 1.2 = K Line safety factor. BL 20T chain is no longer used: shown only for when no other material is available.</p></div></main>`;
  bindLashCalc(); setTimeout(() => { const w = $('#lashW'); if (w && !UI.lashW) w.focus(); }, 100);
}
function afterPlanTab() {
  bindLashCalc();
  const f = $('#preplanFile'); if (f) f.onchange = () => { if (f.files[0]) importPreplan(f.files[0]); };
  const s = $('#bkSearch'); if (s) s.oninput = () => { UI.bkQuery = s.value; const t = s.value.trim().toUpperCase(), b = ship().booking; $('#bkRes').innerHTML = bookingResults(t.length < 2 ? [] : b.rows.filter(r => `${r.maker} ${r.model} ${r.bid} ${r.l} ${r.d} ${r.pod} ${r.shipper}`.toUpperCase().includes(t)).slice(0, 60), t); };
}

/* ---------- Events for plan features ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-pact]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
  const a = b.dataset.pact, v = b.dataset.v;
  if (a === 'view') { UI.planView = v; if (UI.view === 'deck5') { drawD5(); $$('[data-pact=view]').forEach(x => x.classList.toggle('on', x.dataset.v === v)); } else if (UI.view === 'hold') { drawHoldGrid(); $$('[data-pact=view]').forEach(x => x.classList.toggle('on', x.dataset.v === v)); } }
  if (a === 'clear') {
    if (!(await confirmBox('Remove the imported booking list and plan pictures? Your loading data stays.', 'Remove'))) return;
    delete ship().booking; PLAN = null; try { await dbSet('plan-' + ship().id, null); } catch (err) { } save(); rerender();
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.pact === 'pref') { ship().lashPref = t.value; save(); rerender(); }
  if (t.dataset.pact === 'opacity') { UI.planOpacity = +t.value; }
});
document.addEventListener('input', e => { if (e.target.dataset.pact === 'opacity') UI.planOpacity = +e.target.value; });
