'use strict';
/* =========================================================
   SOP (Standard Operating Procedures) – stored on the iPhone,
   read offline with contents, search and zoom
   ========================================================= */
const SOP_CHAPTERS = { 1: 'Introduction', 2: 'Cargo Handling', 3: 'Lashing', 4: 'Vessel Management', 5: 'Manufacturer Requirement', 6: 'Damage Case Study' };
const SOP = { doc: null, meta: null, zoom: 1, obs: null, rendered: new Map(), loading: null };
let pdfjs = null;
async function pdfLib() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('./pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs';
  return pdfjs;
}
async function sopMeta() { if (SOP.meta) return SOP.meta; try { SOP.meta = (await dbGet('sop-meta')) || null; } catch (e) { SOP.meta = null; } return SOP.meta; }
async function sopOpen() {
  if (SOP.doc) return SOP.doc;
  if (SOP.loading) return SOP.loading;
  SOP.loading = (async () => {
    const buf = await dbGet('sop-pdf'); if (!buf) return null;
    const lib = await pdfLib();
    SOP.doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
    return SOP.doc;
  })();
  try { return await SOP.loading; } finally { SOP.loading = null; }
}

/* ---------- Import (once a year) ---------- */
async function sopImport(file) {
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { toast('Please choose a PDF file.'); return; }
  const prog = sopProgress('Saving SOP on this iPhone…');
  try {
    const buf = await file.arrayBuffer();
    const lib = await pdfLib();
    const doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
    // text of every page, for search and contents
    const texts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i), tc = await pg.getTextContent();
      texts.push(tc.items.map(x => x.str).filter(s => s && s.trim() && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(s)).join('\n'));
      if (i % 8 === 0) prog.set(`Reading page ${i} of ${doc.numPages}…`);
    }
    const meta = { name: file.name, size: file.size, pages: doc.numPages, date: new Date().toISOString(), texts, toc: sopContents(texts) };
    await dbSet('sop-pdf', buf); await dbSet('sop-meta', meta);
    SOP.doc = doc; SOP.meta = meta; SOP.rendered.clear();
    S.sopPage = 1; save();
    prog.done(); toast(`SOP saved: ${doc.numPages} pages. Available offline.`, 4000);
    render();
  } catch (e) { console.error(e); prog.done(); toast('Could not save the SOP: ' + e.message, 6000); }
}
function sopProgress(msg) {
  const ov = document.createElement('div'); ov.className = 'modal-ov';
  ov.innerHTML = `<div class="modal"><p id="sopProg">${esc(msg)}</p></div>`; document.body.append(ov);
  return { set: m => { const p = $('#sopProg', ov); if (p) p.textContent = m; }, done: () => ov.remove() };
}
// Contents from the "Cx" chapter marks and "Section n" headings on the pages
function sopContents(texts) {
  const pages = texts.map(t => {
    const L = t.split('\n').map(s => s.trim()).filter(Boolean);
    const ch = L.find(s => /^C\d{1,2}$/.test(s));
    let sec = null;
    for (let i = 0; i < L.length; i++) {
      const m = /^Section\s*(\d{1,2})$/i.exec(L[i]);
      if (m) { const title = L.slice(i + 1).find(s => !/^C\d{1,2}$/.test(s) && !/^\d+$/.test(s) && s.length > 2); sec = { n: +m[1], title: title || '' }; break; }
    }
    return { ch: ch ? +ch.slice(1) : null, sec };
  });
  let chap = 0, prevSec = 0; const runs = {};
  pages.forEach((p, i) => {
    if (p.ch) chap = p.ch; else if (p.sec && p.sec.n === 1 && prevSec > 1) chap += 1;
    if (!p.sec) return;
    if (p.sec.n === 1 && prevSec > 1 && p.ch && p.ch > chap) chap = p.ch;
    const k = chap + '-' + p.sec.n, r = (runs[k] ||= { ch: chap, n: p.sec.n, titles: [], pages: [] });
    r.pages.push(i + 1); if (p.sec.title) r.titles.push(p.sec.title);
    prevSec = p.sec.n;
  });
  return Object.values(runs).map(r => {
    // start = first page of the longest run of consecutive pages (ignores stray headings)
    let best = [r.pages[0], 1], cur = [r.pages[0], 1];
    for (let i = 1; i < r.pages.length; i++) { if (r.pages[i] - r.pages[i - 1] <= 2) cur[1]++; else cur = [r.pages[i], 1]; if (cur[1] > best[1]) best = [...cur]; }
    const cnt = {}; r.titles.forEach(t => { cnt[t] = (cnt[t] || 0) + 1; });
    const title = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || b.length - a.length)[0] || '';
    return { ch: r.ch, n: r.n, title, page: best[0] };
  }).filter(x => x.ch).sort((a, b) => a.page - b.page);
}

/* ---------- Viewer ---------- */
function renderSop() {
  const m = SOP.meta;
  app.innerHTML = `
  <header class="top">
    <button class="ic" data-act="home" aria-label="Back">${I.back}</button>
    <div class="ttl"><b>SOP</b><span id="sopPg">${m ? `Page ${S.sopPage || 1} of ${m.pages}` : ''}</span></div>
    <button class="btn sm" data-sop="contents">Contents</button>
    <button class="btn sm" data-sop="search">Search</button>
  </header>
  <div class="sop-bar"><div class="seg zoom"><button data-sop="zout" aria-label="Smaller">−</button><button data-sop="zin" aria-label="Larger">+</button></div><span class="muted">${Math.round(SOP.zoom * 100)}%</span><span class="muted sop-tip">Turn sideways for larger pages</span></div>
  <div class="sop-pages" id="sopPages">${m ? Array.from({ length: m.pages }, (_, i) => `<div class="sop-page" data-p="${i + 1}" style="width:${SOP.zoom * 100}%"><span class="sop-num">${i + 1}</span></div>`).join('') : ''}</div>`;
  sopMount();
}
async function sopMount() {
  const doc = await sopOpen(); if (!doc || UI.view !== 'sop') return;
  const wrap = $('#sopPages'); if (!wrap) return;
  const p1 = await doc.getPage(1), vp = p1.getViewport({ scale: 1 }), ratio = vp.height / vp.width;
  $$('.sop-page', wrap).forEach(el => { el.style.aspectRatio = `${vp.width} / ${vp.height}`; });
  SOP.rendered.clear();
  if (SOP.obs) SOP.obs.disconnect();
  SOP.obs = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) sopDraw(+en.target.dataset.p, en.target); }), { root: null, rootMargin: '600px 0px' });
  $$('.sop-page', wrap).forEach(el => SOP.obs.observe(el));
  // keep page number + position
  const target = wrap.querySelector(`[data-p="${S.sopPage || 1}"]`); if (target) target.scrollIntoView({ block: 'start' });
  let t; window.onscroll = () => { if (UI.view !== 'sop') return; clearTimeout(t); t = setTimeout(() => {
    const els = $$('.sop-page', wrap), y = window.innerHeight * 0.3; const cur = els.find(el => { const r = el.getBoundingClientRect(); return r.top <= y && r.bottom > y; });
    if (cur) { S.sopPage = +cur.dataset.p; const pg = $('#sopPg'); if (pg) pg.textContent = `Page ${S.sopPage} of ${SOP.meta.pages}`; save(); }
    // free canvases far away to save memory
    els.forEach(el => { const r = el.getBoundingClientRect(); if ((r.bottom < -3000 || r.top > window.innerHeight + 3000) && el.querySelector('canvas')) { el.querySelector('canvas').remove(); SOP.rendered.delete(+el.dataset.p); } });
  }, 120); };
  void ratio;
}
async function sopDraw(n, el) {
  if (SOP.rendered.has(n)) return; SOP.rendered.set(n, true);
  try {
    const page = await SOP.doc.getPage(n), w = el.clientWidth, dpr = Math.min(window.devicePixelRatio || 1, 3);
    const vp0 = page.getViewport({ scale: 1 }), scale = Math.min((w * dpr) / vp0.width, 4), vp = page.getViewport({ scale });
    const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    if (!el.isConnected) return; el.querySelector('canvas')?.remove(); el.append(cv);
  } catch (e) { SOP.rendered.delete(n); }
}
function sopGoto(n) { S.sopPage = clamp(n, 1, SOP.meta.pages); save(); const el = document.querySelector(`.sop-page[data-p="${S.sopPage}"]`); if (el) el.scrollIntoView({ block: 'start' }); }
function sopSheet(html, bind) {
  document.querySelector('.sheet-ov')?.remove();
  const ov = document.createElement('div'); ov.className = 'sheet-ov';
  ov.innerHTML = `<div class="sheet" role="dialog">${html}</div>`; document.body.append(ov);
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  bind && bind(ov); return ov;
}
function sopContentsSheet() {
  const m = SOP.meta, toc = m.toc || [], chs = [...new Set(toc.map(x => x.ch))];
  sopSheet(`<div class="sheet-h"><b>Contents</b><button class="btn sm primary" data-close>Close</button></div>
    <div class="sheet-b">
      <div class="grid2"><label class="fld"><span>Go to page (1–${m.pages})</span><input id="sopGo" inputmode="numeric" value="${S.sopPage || 1}"></label><div class="fld"><span>&nbsp;</span><button class="btn primary" id="sopGoBtn">Go</button></div></div>
      ${chs.map(c => `<h3 class="ch">C${c}${SOP_CHAPTERS[c] ? ' ' + SOP_CHAPTERS[c] : ''}</h3><ul class="toc">${toc.filter(x => x.ch === c).map(x => `<li><button data-page="${x.page}"><span>Section ${x.n} ${esc(x.title)}</span><b>${x.page}</b></button></li>`).join('')}</ul>`).join('') || '<p class="muted">No contents found in this file. Use Go to page or Search.</p>'}
      <p class="muted small">SOP file: ${esc(m.name)}, ${m.pages} pages, saved ${new Date(m.date).toLocaleDateString('en-GB')}.</p>
      <label class="btn filebtn">Replace with new SOP (PDF)<input type="file" accept="application/pdf,.pdf" id="sopReplace" hidden></label>
    </div>`, ov => {
    ov.addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) { ov.remove(); sopGoto(+b.dataset.page); } });
    $('#sopGoBtn', ov).onclick = () => { ov.remove(); sopGoto(+$('#sopGo', ov).value || 1); };
    $('#sopReplace', ov).onchange = e => { const f = e.target.files[0]; if (f) { ov.remove(); SOP.doc = null; sopImport(f); } };
  });
}
function sopSearchSheet() {
  sopSheet(`<div class="sheet-h"><b>Search SOP</b><button class="btn sm primary" data-close>Close</button></div>
    <div class="sheet-b"><label class="fld"><span>Words to find</span><input id="sopQ" value="${esc(UI.sopQ || '')}" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="e.g. lashing, flat battery, EV"></label><div id="sopRes"></div></div>`, ov => {
    const q = $('#sopQ', ov), out = $('#sopRes', ov);
    const run = () => {
      UI.sopQ = q.value; const t = q.value.trim().toLowerCase();
      if (t.length < 2) { out.innerHTML = '<p class="muted">Type at least 2 letters.</p>'; return; }
      const res = []; SOP.meta.texts.forEach((tx, i) => { const flat = tx.replace(/\s+/g, ' '), k = flat.toLowerCase().indexOf(t); if (k >= 0) res.push({ p: i + 1, snip: flat.slice(Math.max(0, k - 50), k + t.length + 70), n: flat.toLowerCase().split(t).length - 1 }); });
      const sec = p => { const toc = SOP.meta.toc || []; const s = toc.filter(x => x.page <= p).pop(); return s ? `C${s.ch} Section ${s.n} ${s.title}` : ''; };
      out.innerHTML = res.length ? `<p class="muted">${res.length} page${res.length === 1 ? '' : 's'}</p><ul class="toc res">${res.slice(0, 120).map(r => `<li><button data-page="${r.p}"><span><b>Page ${r.p}</b> <i class="muted">${esc(sec(r.p))}</i><br>…${esc(r.snip).replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), m => `<mark>${m}</mark>`)}…</span></button></li>`).join('')}</ul>` : '<p class="muted">Not found.</p>';
    };
    q.oninput = run; run(); setTimeout(() => q.focus(), 80);
    ov.addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) { ov.remove(); sopGoto(+b.dataset.page); } });
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-sop]'); if (!b) return; const a = b.dataset.sop;
  if (a === 'open') { UI.view = 'sop'; render(); }
  else if (a === 'contents' && SOP.meta) sopContentsSheet();
  else if (a === 'search' && SOP.meta) sopSearchSheet();
  else if (a === 'zin' || a === 'zout') { const Z = [1, 1.5, 2, 3], i = Z.indexOf(SOP.zoom); SOP.zoom = Z[clamp(i + (a === 'zin' ? 1 : -1), 0, Z.length - 1)]; renderSop(); }
});
document.addEventListener('change', e => { if (e.target.id === 'sopFile' && e.target.files[0]) sopImport(e.target.files[0]); });
function sopHomeHtml() {
  const m = SOP.meta;
  return m ? `<button class="btn big sop-btn" data-sop="open"><span>SOP – Standard Operating Procedures</span><small>${m.pages} pages, offline</small></button>`
    : `<label class="btn big sop-btn filebtn"><span>Add SOP (PDF) for offline reading</span><small>One time, from the Files app</small><input type="file" accept="application/pdf,.pdf" id="sopFile" hidden></label>`;
}
