'use strict';
// ======================================================================
//  介面（Procreate 式）：頂欄、左側滑桿、彈出面板（筆刷庫／圖層／顏色／動作／調整）、圖庫、儲存匯出、繪製迴圈
// ======================================================================
(function(){
const App = Studio.app, U = Studio.util, Comp = Studio.comp, Brush = Studio.brush, Tools = Studio.tools, Store = Studio.store, Ser = Studio.ser, Doc = Studio.Doc;
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const DPR = Math.min(2, window.devicePixelRatio || 1);

App.mode = 'paint'; App.tool = 'brush'; App.sel = null; App.preview = null; App.cursor = null; App.history = new Studio.History();
App.cap = { downloads: null, assets: null, db: null };
App.C = { h: 0.72, s: 0.25, v: 1 }; App.rgb1 = [201, 191, 255]; App.rgb2v = [42, 29, 85];
App.rgb = () => App.rgb1; App.rgb2 = () => App.rgb2v; App.hex2 = () => U.hex(...App.rgb2v);
App.selKind = 'rect';

// ---------------- 小工具 ----------------
let toastT; App.toast = (s) => { const t = $('#toast'); t.textContent = s; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); };
let hintS = ''; App.hint = (s) => { if (s === hintS) return; hintS = s; $('#hint').textContent = s; };
App.modal = (html) => { const d = $('#dialog'), box = d.querySelector('.box'); box.innerHTML = html; d.hidden = false; return box; };
App.closeModal = () => { $('#dialog').hidden = true; };
App.prompt = (msg, def) => new Promise(res => { const b = App.modal(`<h2>${msg}</h2><div class="row"><input type="text" id="pIn" class="grow" value="${(def || '').replace(/"/g, '&quot;')}"></div><div class="btns"><button class="sm" id="pNo">取消</button><button class="sm pri" id="pOk">確定</button></div>`); const inp = b.querySelector('#pIn'); inp.focus(); inp.select(); const ok = () => { App.closeModal(); res(inp.value.trim()); }; b.querySelector('#pOk').onclick = ok; inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') { App.closeModal(); res(null); } }; b.querySelector('#pNo').onclick = () => { App.closeModal(); res(null); }; });
App.confirm = (msg) => new Promise(res => { const b = App.modal(`<h2>${msg}</h2><div class="btns"><button class="sm" id="pNo">取消</button><button class="sm pri" id="pOk">確定</button></div>`); b.querySelector('#pOk').onclick = () => { App.closeModal(); res(true); }; b.querySelector('#pNo').onclick = () => { App.closeModal(); res(false); }; });
$('#dialog').addEventListener('pointerdown', (e) => { if (e.target === e.currentTarget) App.closeModal(); });

// ---------------- 彈出面板：一次只開一個，點外面關掉 ----------------
let openPop = null;
App.openPop = (id, anchor, opts = {}) => {
  const el = $('#' + id); if (openPop === id && !opts.keep) { App.closePopups(); return; } App.closePopups(); el.hidden = false; openPop = id;
  const r = anchor ? anchor.getBoundingClientRect() : { left: 8, right: 8, top: 46, bottom: 46 }; const w = el.offsetWidth, h = el.offsetHeight;
  const above = opts.above || (anchor && r.top > innerHeight * 0.6); // 工具列在下方時，面板往上開
  let x = opts.alignRight ? r.right - w : r.left, y = above ? r.top - h - 6 : r.bottom + 6; x = U.clamp(x, 6, innerWidth - w - 6); y = U.clamp(y, 6, innerHeight - h - 6); el.style.left = x + 'px'; el.style.top = y + 'px';
  if (opts.onopen) opts.onopen();
};
App.closePopups = () => { $$('.pop').forEach(p => p.hidden = true); openPop = null; };
document.addEventListener('pointerdown', (e) => { if (!openPop) return; if (e.target.closest('.pop') || e.target.closest('#top') || e.target.closest('.bar') || e.target.closest('#dialog')) return; App.closePopups(); }, true);
$$('.pophead.tabs').forEach(head => head.querySelectorAll('.tab').forEach(t => t.onclick = () => { head.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t)); head.parentElement.querySelectorAll('[data-t]').forEach(x => { if (!x.classList.contains('tab')) x.hidden = x.dataset.t !== t.dataset.t; }); if (t.dataset.t === 'wheel') drawWheel(); }));

// ---------------- 文件 ----------------
App.loadDoc = (doc) => {
  App.doc = doc; App.history.clear(); App.sel = null; App.preview = null; Tools.move.fl = null;
  App.strokeCanvas = U.mkCanvas(doc.w, doc.h); App.composite = U.mkCanvas(doc.w, doc.h);
  for (const l of doc.layers) { l.thumbDirty = true; l.part._bb = null; }
  document.title = doc.name + ' · 夢境畫室';
  try { localStorage.setItem('somnia-last', doc.id); } catch (e) {}
  App.refreshLayers(); App.fit(); Studio.anim.refresh(); if (App.mode === 'rig') Studio.rig.enter(); App.compDirty = true; App.invalidate();
};
App.newDoc = (w, h, name) => { const d = new Doc(w, h, name); d.addLayer('body'); App.loadDoc(d); App.toast(`新畫布 ${w}×${h}`); };

// ---------------- 顏色：色環（色相環＋飽和/明度方塊）、色盤、數值、ColorDrop ----------------
const PAL_KEY = 'somnia-palette', REC_KEY = 'somnia-recent';
let palette = JSON.parse(localStorage.getItem(PAL_KEY) || 'null') || ['#c9bfff', '#a9d4ff', '#ffb7d5', '#ece9ff', '#fff3c4', '#ffe08a', '#8ff2ff', '#9ff5c3', '#ffe4d8', '#f4b8a0', '#7f72d8', '#4a3580', '#2a1d55', '#13112a', '#ff6b8a', '#ffffff'];
let recent = JSON.parse(localStorage.getItem(REC_KEY) || '[]');
const WH = { R: 120, ring: 22, sq: 0 }; WH.sq = Math.floor((WH.R - WH.ring - 8) * Math.SQRT2);
function drawWheel(){ const c = $('#wheel'), x = c.getContext('2d'); const R = WH.R, C = App.C; x.clearRect(0, 0, 240, 240);
  for (let i = 0; i < 360; i += 2) { const [r, g, b] = U.hsv2rgb(i / 360, 1, 1); x.beginPath(); x.strokeStyle = `rgb(${r},${g},${b})`; x.lineWidth = WH.ring; x.arc(R, R, R - WH.ring / 2, (i - 1) * Math.PI / 180, (i + 2) * Math.PI / 180); x.stroke(); }
  const s = WH.sq, x0 = R - s / 2, y0 = R - s / 2; const [hr, hg, hb] = U.hsv2rgb(C.h, 1, 1); x.fillStyle = `rgb(${hr},${hg},${hb})`; x.fillRect(x0, y0, s, s); let g = x.createLinearGradient(x0, 0, x0 + s, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(x0, y0, s, s); g = x.createLinearGradient(0, y0, 0, y0 + s); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(x0, y0, s, s);
  const a = C.h * Math.PI * 2; x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.arc(R + Math.cos(a) * (R - WH.ring / 2), R + Math.sin(a) * (R - WH.ring / 2), 8, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = C.v > 0.6 && C.s < 0.6 ? '#000' : '#fff'; x.lineWidth = 2; x.beginPath(); x.arc(x0 + C.s * s, y0 + (1 - C.v) * s, 7, 0, Math.PI * 2); x.stroke(); }
let wheelDrag = null;
function wheelPt(e){ const r = $('#wheel').getBoundingClientRect(); return { x: (e.clientX - r.left) * 240 / r.width, y: (e.clientY - r.top) * 240 / r.height }; }
$('#wheel').addEventListener('pointerdown', (e) => { const p = wheelPt(e); const d = Math.hypot(p.x - WH.R, p.y - WH.R); const s = WH.sq, x0 = WH.R - s / 2; wheelDrag = d > WH.R - WH.ring - 4 ? 'ring' : (p.x >= x0 - 6 && p.x <= x0 + s + 6 && p.y >= x0 - 6 && p.y <= x0 + s + 6) ? 'sq' : null; if (!wheelDrag) return; e.target.setPointerCapture(e.pointerId); wheelMove(e); });
function wheelMove(e){ if (!wheelDrag) return; const p = wheelPt(e); if (wheelDrag === 'ring') { let a = Math.atan2(p.y - WH.R, p.x - WH.R) / (Math.PI * 2); if (a < 0) a += 1; App.C.h = a; } else { const s = WH.sq, x0 = WH.R - s / 2; App.C.s = U.clamp((p.x - x0) / s, 0, 1); App.C.v = U.clamp(1 - (p.y - x0) / s, 0, 1); } applyColor(); }
$('#wheel').addEventListener('pointermove', wheelMove); $('#wheel').addEventListener('pointerup', () => { wheelDrag = null; pushRecent(); });
function applyColor(fromHex){ const C = App.C; App.rgb1 = U.hsv2rgb(C.h, C.s, C.v); const hex = U.hex(...App.rgb1); $('#colorDot').style.background = hex; $('#swPrimary').style.background = hex; $('#swSecondary').style.background = App.hex2(); if (!fromHex) $('#hexIn').value = hex; $('#cH').value = Math.round(C.h * 360); $('#cS').value = Math.round(C.s * 100); $('#cV').value = Math.round(C.v * 100); ['cH', 'cS', 'cV'].forEach(id => $('#' + id).nextElementSibling.textContent = $('#' + id).value); if (!$('#popColor').hidden) drawWheel(); Brush.cache.clear(); App.invalidate(); }
App.setRGB = (rgb) => { const [h, s, v] = U.rgb2hsv(...rgb); App.C = { h, s, v }; applyColor(); };
App.swapColors = () => { const a = App.rgb1; App.rgb1 = App.rgb2v; App.rgb2v = a; App.setRGB(App.rgb1); };
function pushRecent(){ const hex = U.hex(...App.rgb1); recent = [hex, ...recent.filter(c => c !== hex)].slice(0, 10); localStorage.setItem(REC_KEY, JSON.stringify(recent)); renderSwatches(); }
function renderSwatches(){ const mk = (box, arr, del) => { box.innerHTML = ''; arr.forEach(hex => { const d = document.createElement('div'); d.style.background = hex; d.title = hex; let lp; d.onpointerdown = () => { if (del) lp = setTimeout(() => { palette = palette.filter(c => c !== hex); localStorage.setItem(PAL_KEY, JSON.stringify(palette)); renderSwatches(); App.toast('已從色盤移除'); }, 650); }; d.onpointerup = () => { clearTimeout(lp); }; d.onpointerleave = () => clearTimeout(lp); d.onclick = () => { App.setRGB(U.parseHex(hex)); pushRecent(); }; box.appendChild(d); }); }; mk($('#palette'), palette, true); mk($('#recent'), recent, false); }
['cH', 'cS', 'cV'].forEach(id => $('#' + id).oninput = () => { App.C = { h: +$('#cH').value / 360, s: +$('#cS').value / 100, v: +$('#cV').value / 100 }; applyColor(); });
$('#hexIn').addEventListener('change', (e) => { const rgb = U.parseHex(e.target.value); if (rgb) { App.setRGB(rgb); pushRecent(); } });
$('#btnAddPal').onclick = () => { const hex = U.hex(...App.rgb1); if (!palette.includes(hex)) { palette.push(hex); localStorage.setItem(PAL_KEY, JSON.stringify(palette)); renderSwatches(); App.toast('已加入色盤'); } };
$('#swPair').onclick = App.swapColors;
// ColorDrop：把顏色圓點拖到畫布上＝填色
(() => { const b = $('#btnColor'); let p0 = null, dragging = false; const sw = $('#dropSwatch');
  b.addEventListener('pointerdown', (e) => { p0 = { x: e.clientX, y: e.clientY }; dragging = false; try { b.setPointerCapture(e.pointerId); } catch (err) {} });
  b.addEventListener('pointermove', (e) => { if (!p0) return; if (!dragging && Math.hypot(e.clientX - p0.x, e.clientY - p0.y) > 10) { dragging = true; sw.hidden = false; sw.style.background = U.hex(...App.rgb1); App.closePopups(); } if (dragging) { sw.style.left = e.clientX + 'px'; sw.style.top = e.clientY + 'px'; } });
  b.addEventListener('pointerup', (e) => { if (!p0) return; const r = App.screen.getBoundingClientRect(); if (dragging) { sw.hidden = true; if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom && App.mode !== 'rig') { const p = App.screenToDoc({ x: e.clientX - r.left, y: e.clientY - r.top }); Tools.fill.down(p); App.toast('填色'); pushRecent(); } } else App.openPop('popColor', b, { alignRight: true, onopen: drawWheel }); p0 = null; dragging = false; });
})();

// ---------------- 工具、筆刷庫、左側滑桿 ----------------
const TOOL_HINT = { brush: '筆刷：畫。兩指拖＝移動縮放，兩指點＝復原，手指長按＝吸色', smudge: '塗抹：把顏色往外帶，做柔和交界', eraser: '橡皮擦', fill: '填色：點一下填滿相連區域（也可以把右上角的顏色圓點拖到畫布上）', gradient: '漸層：在畫布上拖一條線。圖層開「鎖定透明度」就只會畫在已有顏色上', picker: '吸色：點畫面取色', select: '選取：拖出範圍，之後只會畫在裡面', lasso: '套索：圈出範圍', move: '變形：拖＝移動，角＝縮放，上面的圓＝旋轉', hand: '移動畫布' };
App.setTool = (name) => { if (App.tool === 'move' && name !== 'move' && Tools.move.fl) Tools.move.apply(); if (App.tool === 'tone' && name !== 'tone' && Tools.tone.layer) { Tools.tone.leave(); $('#popTone').hidden = true; } if (name === 'select' || name === 'lasso') { App.selKind = name === 'lasso' ? 'lasso' : 'rect'; }
  App.tool = name; Brush.use(name); $$('#top [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === name || (b.dataset.tool === 'select' && name === 'lasso'))); syncSliders(); App.hint(TOOL_HINT[name] || '');
  $('#barSelect').hidden = !(name === 'select' || name === 'lasso'); $('#barMove').hidden = name !== 'move'; $$('#barSelect .chip[data-k]').forEach(c => c.classList.toggle('on', c.dataset.k === App.selKind));
  if (name === 'move') Tools.move.activate(); App.invalidate(); };
$$('#top [data-tool]').forEach(b => b.onclick = () => { const t = b.dataset.tool; if (t === 'brush' || t === 'smudge' || t === 'eraser') { if (App.tool === t) App.openPop('popBrush', b, { alignRight: true, onopen: renderBrushLib }); else App.setTool(t); } else if (t === 'select') App.setTool(App.tool === 'select' || App.tool === 'lasso' ? 'brush' : App.selKind === 'lasso' ? 'lasso' : 'select'); else App.setTool(App.tool === t ? 'brush' : t); });
$$('#barSelect .chip[data-k]').forEach(c => c.onclick = () => App.setTool(c.dataset.k === 'lasso' ? 'lasso' : 'select'));
$('#selAll').onclick = () => { const d = App.doc, p = new Path2D(); p.rect(0, 0, d.w, d.h); App.sel = { path: p, bbox: { x: 0, y: 0, w: d.w, h: d.h } }; App.invalidate(); };
$('#selNone').onclick = () => { App.sel = null; App.invalidate(); }; $('#selDone').onclick = () => App.setTool('brush');
// 把選取範圍剪成新的零件圖層（分零件給骨架用）
App.cutToLayer = function cutToLayer(name, quiet){ const d = App.doc, src = d.active; if (!App.sel) { App.toast('先圈出範圍'); return; } if (!src || src.locked) { App.toast('圖層已鎖定'); return; }
  const cv = src.canvas(d.frame); const snap = App.history.beginPixels(cv); const nl = new Studio.Layer(d, name); nl.opacity = src.opacity; nl.blend = src.blend;
  const nx = nl.canvas(0).getContext('2d'); nx.save(); nx.clip(App.sel.path); nx.drawImage(cv, 0, 0); nx.restore();
  const x = cv.getContext('2d'); x.save(); x.clip(App.sel.path); x.clearRect(0, 0, d.w, d.h); x.restore();
  const i = d.layerIndex(src) + 1; const before = d.layers.slice(), a0 = d.activeId; d.layers.splice(i, 0, nl); d.activeId = nl.id; const after = d.layers.slice();
  App.history.commitPixels(snap, App.sel.bbox, src); const px = App.history.undoS.pop(); // 把像素與結構合成一步
  App.history.push({ undo: () => { px.undo(); d.layers = before.slice(); d.activeId = a0; App.refreshLayers(); App.invalidate(); }, redo: () => { px.redo(); d.layers = after.slice(); d.activeId = nl.id; App.refreshLayers(); App.invalidate(); } });
  src.thumbDirty = true; App.sel = null; App.refreshLayers(); App.invalidate(); App.dirty(); if (!quiet) App.toast('已切出「' + name + '」，可以繼續圈下一個'); };
const cutToLayer = App.cutToLayer;
$('#selCut').onclick = (e) => { if (!App.sel) { App.toast('先圈出範圍'); return; } const m = $('#partMenu'); m.innerHTML = PARTS.filter(p => p[0] !== 'sketch').map(p => `<button class="mi" data-n="${p[0]}">${p[0]} <span class="dim">${p[1]}</span></button>`).join('') + '<hr><button class="mi" data-n="?">自訂名稱…</button>'; App.openPop('partMenu', e.currentTarget, { keep: true, above: true });
  m.querySelectorAll('button').forEach(b => b.onclick = async () => { App.closePopups(); let n = b.dataset.n; if (n === '?') { n = await App.prompt('新圖層名稱', '零件'); if (!n) return; } cutToLayer(n); }); };
$('#mvApply').onclick = () => { Tools.move.apply(); App.setTool('brush'); }; $('#mvCancel').onclick = () => { Tools.move.discard(); App.setTool('brush'); }; $('#mvFlipH').onclick = () => Tools.move.flip(true); $('#mvFlipV').onclick = () => Tools.move.flip(false);
$$('#popAdjust [data-adj]').forEach(b => b.onclick = () => { App.closePopups(); const k = b.dataset.adj; if (k.startsWith('gradient')) { Tools.gradient.opts.type = k.split('-')[1]; Tools.gradient.opts.to = (document.querySelector('input[name=gto]:checked') || {}).value || 'secondary'; App.setTool('gradient'); } else if (k === 'tone') { if (Tools.tone.activate()) { App.tool = 'tone'; App.hint('網點：調好參數按「套用」；選「拖一條線漸層」後在畫布上拖'); openTone(); } } else App.setTool(k); });
// 網點填滿面板
const TK = { tPitch: ['pitch', 1], tDens: ['density', 0.01], tD0: ['d0', 0.01], tD1: ['d1', 0.01], tAngle: ['angle', 1] };
for (const id in TK) $('#' + id).addEventListener('input', (e) => { const [k, m] = TK[id]; Tools.tone.opts[k] = +e.target.value * m; e.target.nextElementSibling.textContent = e.target.value; App.invalidate(); });
$('#tShape').onchange = (e) => { Tools.tone.opts.shape = e.target.value; App.invalidate(); };
$$('#popTone [data-src]').forEach(c => c.onclick = () => { Tools.tone.opts.src = c.dataset.src; $$('#popTone [data-src]').forEach(x => x.classList.toggle('on', x === c)); const g = c.dataset.src === 'gradient'; $('#tDensRow').hidden = g; $('#tD0Row').hidden = !g; $('#tD1Row').hidden = !g; Tools.tone.refreshField(); if (g) App.toast('在畫布上拖一條線'); });
function openTone(){ const o = Tools.tone.opts; for (const id in TK) { const [k, m] = TK[id]; $('#' + id).value = Math.round(o[k] / m); $('#' + id).nextElementSibling.textContent = Math.round(o[k] / m); } $('#tShape').value = o.shape; App.openPop('popTone', $('#btnAdjust'), { keep: true }); }
$('#toneApply').onclick = () => { Tools.tone.commit(); App.closePopups(); App.setTool('brush'); };
$('#toneCancel').onclick = () => { Tools.tone.leave(); App.closePopups(); App.setTool('brush'); };
$('#btnAdjust').onclick = (e) => App.openPop('popAdjust', e.currentTarget);
$('#btnModify').onclick = (e) => { if (App.tool === 'picker') { App.setTool(App.pickerReturn || 'brush'); App.pickerReturn = null; } else { App.pickerReturn = App.tool; App.setTool('picker'); } e.currentTarget.classList.toggle('on', App.tool === 'picker'); };
App.setBrush = (k, v) => { Brush.s[k] = v; syncSliders(); if (!$('#popBrushSet').hidden) syncBrushSet(); App.invalidate(); };
function syncSliders(){ const s = Brush.s; $('#sizeSl .fill').style.height = (Math.sqrt(s.size / 300) * 100) + '%'; $('#sizeSl b').textContent = Math.round(s.size); $('#opSl .fill').style.height = (s.opacity * 100) + '%'; $('#opSl b').textContent = Math.round(s.opacity * 100); }
function vslider(el, fn){ let on = false; const h = (e) => { const r = el.getBoundingClientRect(); fn(U.clamp(1 - (e.clientY - r.top) / r.height, 0, 1)); }; el.addEventListener('pointerdown', (e) => { on = true; el.setPointerCapture(e.pointerId); h(e); }); el.addEventListener('pointermove', (e) => { if (on) h(e); }); el.addEventListener('pointerup', () => on = false); }
vslider($('#sizeSl'), (t) => App.setBrush('size', Math.max(1, Math.round(t * t * 300)))); vslider($('#opSl'), (t) => App.setBrush('opacity', Math.max(0.01, Math.round(t * 100) / 100)));
// 筆刷庫
let curSet = 0;
function brushPreview(canvas, s, rgb){ const w = canvas.width, h = canvas.height; const x = canvas.getContext('2d'); x.clearRect(0, 0, w, h); const sc = Math.min(1, (h * 0.55) / Math.max(8, s.size)); const st = new Studio.Stroke('paint', canvas, Object.assign({}, s, { size: Math.max(2, s.size * sc), streamline: 0 }), rgb || [236, 233, 255]); const n = 40; for (let i = 0; i <= n; i++) { const t = i / n; st.add({ x: 10 + (w - 20) * t, y: h / 2 + Math.sin(t * Math.PI * 2) * h * 0.22 }, 0.25 + 0.75 * Math.sin(t * Math.PI)); } const out = U.mkCanvas(w, h); st.applyTo(out, { alphaLock: false }); x.clearRect(0, 0, w, h); x.drawImage(out, 0, 0); }
function renderBrushLib(){ const sets = $('#brushSets'); sets.innerHTML = ''; Brush.library.forEach((g, i) => { const b = document.createElement('button'); b.textContent = g.set; b.className = i === curSet ? 'on' : ''; b.onclick = () => { curSet = i; renderBrushLib(); }; sets.appendChild(b); });
  const grid = $('#brushGrid'); grid.innerHTML = ''; const cur = Brush.current[App.tool] || Brush.current.brush;
  Brush.library[curSet].items.forEach(it => { const el = document.createElement('div'); el.className = 'bitem' + (it.n === cur ? ' on' : ''); const c = U.mkCanvas(300, 88); brushPreview(c, it.s); el.appendChild(c); const t = document.createElement('div'); t.innerHTML = `<div class="nm">${it.n}</div><div class="meta">${it.d || ''}</div>`; el.appendChild(t); el.onclick = () => { const keep = { size: Brush.s.size }; delete Brush.s.tone; Object.assign(Brush.s, JSON.parse(JSON.stringify(it.s))); if (App.tool === 'eraser' || App.tool === 'smudge') Brush.s.size = keep.size; Brush.current[App.tool] = it.n; renderBrushLib(); syncSliders(); App.toast(it.n); }; grid.appendChild(el); }); }
$('#brushSettingsBtn').onclick = (e) => { App.openPop('popBrushSet', e.currentTarget, { alignRight: true, onopen: syncBrushSet }); };
const BKEYS = { bSize: ['size', 1], bOp: ['opacity', 0.01], bHard: ['hardness', 0.01], bSpace: ['spacing', 0.01], bStream: ['streamline', 0.01], bSmooth: ['smooth', 0.01], bFilter: ['filter', 0.01], bScatter: ['scatter', 1], bCount: ['count', 1] };
for (const id in BKEYS) $('#' + id).addEventListener('input', (e) => { const [k, m] = BKEYS[id]; Brush.s[k] = +e.target.value * m; e.target.nextElementSibling.textContent = e.target.value; syncSliders(); brushPreview($('#bsPreview'), Brush.s, App.rgb1); });
$('#bTip').onchange = (e) => { Brush.s.tip = e.target.value; brushPreview($('#bsPreview'), Brush.s, App.rgb1); }; $('#bPSize').onchange = (e) => Brush.s.pSize = e.target.checked; $('#bPOp').onchange = (e) => Brush.s.pOp = e.target.checked;
const TBK = { bTPitch: ['pitch', 1], bTDens: ['density', 0.01], bTAngle: ['angle', 1] };
for (const id in TBK) $('#' + id).addEventListener('input', (e) => { if (!Brush.s.tone) return; const [k, m] = TBK[id]; Brush.s.tone[k] = +e.target.value * m; e.target.nextElementSibling.textContent = e.target.value; brushPreview($('#bsPreview'), Brush.s, App.rgb1); });
$('#bTShape').onchange = (e) => { if (Brush.s.tone) { Brush.s.tone.shape = e.target.value; brushPreview($('#bsPreview'), Brush.s, App.rgb1); } };
function syncBrushSet(){ const s = Brush.s; $('#bsName').textContent = (Brush.current[App.tool] || '筆刷') + ' · 設定'; for (const id in BKEYS) { const [k, m] = BKEYS[id]; const el = $('#' + id); el.value = Math.round((s[k] || 0) / m); el.nextElementSibling.textContent = Math.round((s[k] || 0) / m); } $('#bTip').value = s.tip; $('#bPSize').checked = s.pSize; $('#bPOp').checked = s.pOp;
  $('#bToneBox').hidden = !s.tone; if (s.tone) { for (const id in TBK) { const [k, m] = TBK[id]; $('#' + id).value = Math.round(s.tone[k] / m); $('#' + id).nextElementSibling.textContent = Math.round(s.tone[k] / m); } $('#bTShape').value = s.tone.shape; }
  brushPreview($('#bsPreview'), s, App.rgb1); }

// ---------------- 圖層 ----------------
const PARTS = [['hair_back', '後髮'], ['leg_L', '左腿'], ['leg_R', '右腿'], ['body', '身體'], ['arm_L', '左手臂'], ['arm_R', '右手臂'], ['cloth', '飄動物（披風、裙擺）'], ['head', '頭'], ['mouth_normal', '嘴巴'], ['eye_normal', '眼睛'], ['brow', '眉毛'], ['hair_front', '前髮'], ['hat', '頭飾'], ['weapon', '武器、道具'], ['trans', '半透明部件'], ['sketch', '草稿（不匯出）']];
const BLENDS = [['source-over', '一般'], ['multiply', '色彩增值'], ['screen', '濾色'], ['overlay', '覆蓋'], ['soft-light', '柔光'], ['lighter', '相加（發光）'], ['color-dodge', '加亮'], ['color-burn', '加深'], ['hue', '色相'], ['color', '顏色']];
const blendName = (b) => (BLENDS.find(x => x[0] === b) || ['', '一般'])[1];
function structural(fn){ const d = App.doc; const before = d.layers.slice(), a0 = d.activeId; fn(); const after = d.layers.slice(), a1 = d.activeId; App.history.push({ undo: () => { d.layers = before.slice(); d.activeId = a0; App.refreshLayers(); App.invalidate(); }, redo: () => { d.layers = after.slice(); d.activeId = a1; App.refreshLayers(); App.invalidate(); } }); App.refreshLayers(); App.invalidate(); App.dirty(); }
App.setActive = (l) => { if (App.tool === 'move' && Tools.move.fl) Tools.move.apply(); App.doc.activeId = l.id; App.refreshLayers(); if (App.mode === 'rig') Studio.rig.select(l); App.invalidate(); };
App.refreshLayers = () => {
  const d = App.doc, box = $('#layerList'); box.innerHTML = '';
  d.layers.forEach((l) => { const row = document.createElement('div'); row.className = 'layer' + (l.id === d.activeId ? ' on' : '') + (l.clip ? ' clip' : ''); row.dataset.id = l.id;
    const th = document.createElement('canvas'); th.width = th.height = 46; l.thumbEl = th; l.thumbDirty = true; row.appendChild(th);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.innerHTML = `${l.name}<div class="meta">${Math.round(l.opacity * 100)}% · ${blendName(l.blend)}${l.alphaLock ? ' · α鎖' : ''}${l.locked ? ' · 🔒' : ''}${l.animated ? ' · ▶' + Object.keys(l.cels).length : ''}</div>`; row.appendChild(nm);
    const badge = document.createElement('button'); badge.className = 'badge'; badge.textContent = l.blend === 'source-over' ? 'N' : blendName(l.blend)[0]; badge.title = '不透明度與混合模式'; badge.onclick = (e) => { e.stopPropagation(); App.doc.activeId = l.id; App.refreshLayers(); openBlend(badge); }; row.appendChild(badge);
    const eye = document.createElement('button'); eye.className = 'eye' + (l.visible ? ' on' : ''); eye.textContent = '✓'; eye.onclick = (e) => { e.stopPropagation(); l.visible = !l.visible; App.refreshLayers(); App.invalidate(); App.dirty(); }; row.appendChild(eye);
    row.onclick = () => { if (l.id === d.activeId) openLayerMenu(row, l); else App.setActive(l); };
    // 長按拖曳排序
    let lp = null, drag = null; row.addEventListener('pointerdown', (e) => { if (e.target.tagName === 'BUTTON') return; lp = setTimeout(() => { drag = { y: e.clientY }; row.classList.add('dragging'); row.setPointerCapture(e.pointerId); }, 350); });
    row.addEventListener('pointermove', (e) => { if (!drag) return; const over = document.elementFromPoint(e.clientX, e.clientY); const tr = over && over.closest('.layer'); if (tr && tr !== row) { const ti = d.layers.findIndex(x => x.id === tr.dataset.id), fi = d.layerIndex(l); if (ti !== fi) { d.layers.splice(fi, 1); d.layers.splice(ti, 0, l); App.refreshLayers(); App.invalidate(); } } });
    const end = () => { clearTimeout(lp); if (drag) { drag = null; row.classList.remove('dragging'); App.dirty(); } }; row.addEventListener('pointerup', end); row.addEventListener('pointercancel', end);
    box.appendChild(row); });
  Studio.anim.refresh(); if (App.mode === 'rig') { Studio.rig.sel = d.active; Studio.rig.refresh(); Studio.rig.refreshParams(); }
  updateThumbs();
};
function updateThumbs(){ const d = App.doc; for (const l of d.layers) if (l.thumbDirty && l.thumbEl) { const x = l.thumbEl.getContext('2d'); x.clearRect(0, 0, 46, 46); const s = 46 / Math.max(d.w, d.h); x.drawImage(l.canvas(d.frame), 0, 0, d.w * s, d.h * s); l.thumbDirty = false; } }
function openLayerMenu(row, l){ const m = $('#popLayerMenu'); const d = App.doc; const items = [['重新命名', async () => { const n = await App.prompt('圖層名稱', l.name); if (n) { l.name = n; App.refreshLayers(); App.dirty(); } }], ['複製', () => structural(() => { const n = d.addLayer(l.name + ' 副本'); Object.assign(n, { opacity: l.opacity, blend: l.blend, clip: l.clip, alphaLock: l.alphaLock, animated: l.animated }); n.cels = {}; for (const k in l.cels) n.cels[k] = U.cloneCanvas(l.cels[k]); n.part = JSON.parse(JSON.stringify(l.part)); n.part._bb = null; })], ['填滿目前顏色', () => { const cv = l.canvas(d.frame); const s = App.history.beginPixels(cv); const x = cv.getContext('2d'); x.save(); if (App.sel) x.clip(App.sel.path); x.fillStyle = U.hex(...App.rgb1); x.fillRect(0, 0, d.w, d.h); x.restore(); App.history.commitPixels(s, null, l); App.invalidate(); App.dirty(); }], ['清除', () => { const cv = l.canvas(d.frame); const s = App.history.beginPixels(cv); const x = cv.getContext('2d'); x.save(); if (App.sel) x.clip(App.sel.path); x.clearRect(0, 0, d.w, d.h); x.restore(); App.history.commitPixels(s, null, l); App.invalidate(); App.dirty(); }], [(l.alphaLock ? '✓ ' : '') + '鎖定透明度', () => { l.alphaLock = !l.alphaLock; App.refreshLayers(); App.dirty(); }], [(l.clip ? '✓ ' : '') + '剪裁遮罩（只畫在下層有顏色處）', () => { l.clip = !l.clip; App.refreshLayers(); App.invalidate(); App.dirty(); }], [(l.animated ? '✓ ' : '') + '動畫圖層', () => { l.animated = !l.animated; App.refreshLayers(); App.invalidate(); App.dirty(); }], [(l.locked ? '✓ ' : '') + '鎖定', () => { l.locked = !l.locked; App.refreshLayers(); App.dirty(); }], ['向下合併', () => mergeDown(l)], ['上移', () => { const i = d.layerIndex(l); if (i < d.layers.length - 1) structural(() => { d.layers.splice(i, 1); d.layers.splice(i + 1, 0, l); }); }], ['下移', () => { const i = d.layerIndex(l); if (i > 0) structural(() => { d.layers.splice(i, 1); d.layers.splice(i - 1, 0, l); }); }], ['刪除', () => { if (d.layers.length === 1) { App.toast('至少要留一個圖層'); return; } structural(() => d.removeLayer(l)); }, 'danger']];
  m.innerHTML = ''; items.forEach(([t, fn, cls]) => { const b = document.createElement('button'); b.className = 'mi' + (cls ? ' ' + cls : ''); b.textContent = t; b.onclick = () => { App.closePopups(); fn(); }; m.appendChild(b); }); App.openPop('popLayerMenu', row, { keep: true, alignRight: true }); }
function openBlend(anchor){ const l = App.doc.active; const list = $('#blendList'); list.innerHTML = ''; BLENDS.forEach(([v, n]) => { const b = document.createElement('div'); b.className = 'it' + (l.blend === v ? ' on' : ''); b.innerHTML = `<span class="nm">${n}</span>`; b.onclick = () => { l.blend = v; App.refreshLayers(); openBlend(anchor); App.invalidate(); App.dirty(); }; list.appendChild(b); }); $('#lyOp').value = Math.round(l.opacity * 100); $('#lyOp').nextElementSibling.textContent = Math.round(l.opacity * 100); App.openPop('popBlend', anchor, { keep: true, alignRight: true }); }
$('#lyOp').oninput = (e) => { const l = App.doc.active; if (!l) return; l.opacity = +e.target.value / 100; e.target.nextElementSibling.textContent = e.target.value; App.invalidate(); }; $('#lyOp').onchange = () => { App.refreshLayers(); App.dirty(); };
function mergeDown(l){ const d = App.doc; const i = d.layerIndex(l); if (i <= 0) { App.toast('下面沒有圖層'); return; } const lo = d.layers[i - 1]; const oldCels = lo.cels; const cels = {}; const keys = new Set([...Object.keys(lo.cels), ...(l.animated ? Object.keys(l.cels) : [])].map(Number));
  for (const k of keys) { const c = U.cloneCanvas(lo.canvas(k)); const x = c.getContext('2d'); x.globalAlpha = l.opacity; x.globalCompositeOperation = l.blend; if (l.clip) { const t = U.cloneCanvas(l.canvas(k)); const tx = t.getContext('2d'); tx.globalCompositeOperation = 'destination-in'; tx.drawImage(lo.canvas(k), 0, 0); x.drawImage(t, 0, 0); } else x.drawImage(l.canvas(k), 0, 0); cels[k] = c; }
  const before = d.layers.slice(); App.history.push({ undo: () => { lo.cels = oldCels; d.layers = before.slice(); d.activeId = l.id; lo.thumbDirty = true; App.refreshLayers(); App.invalidate(); }, redo: () => { lo.cels = cels; d.layers = before.filter(x => x !== l); d.activeId = lo.id; lo.thumbDirty = true; App.refreshLayers(); App.invalidate(); } });
  lo.cels = cels; if (keys.size > 1) lo.animated = true; d.removeLayer(l); d.activeId = lo.id; lo.thumbDirty = true; App.refreshLayers(); App.invalidate(); App.dirty(); }
$('#lyAdd').onclick = () => structural(() => App.doc.addLayer('圖層 ' + (App.doc.layers.length + 1)));
$('#lyPart').onclick = (e) => { const m = $('#partMenu'); m.innerHTML = PARTS.map(p => `<button class="mi" data-n="${p[0]}">${p[0]} <span class="dim">${p[1]}</span></button>`).join('') + '<hr><button class="mi" data-n="*">一次建立整套零件圖層</button>'; App.openPop('partMenu', e.currentTarget, { keep: true, alignRight: true });
  m.querySelectorAll('button').forEach(b => b.onclick = () => { App.closePopups(); const n = b.dataset.n; if (n === '*') structural(() => { const d = App.doc; d.layers = d.layers.filter(l => !(l.name === 'body' && !U.alphaBounds(l.canvas(0)))); PARTS.filter(p => p[0] !== 'sketch').forEach(p => d.addLayer(p[0], d.layers.length)); }); else structural(() => App.doc.addLayer(n)); $('#popLayers').hidden = false; openPop = 'popLayers'; }); };
$('#btnLayers').onclick = (e) => App.openPop('popLayers', e.currentTarget, { alignRight: true }); $('#btnLayers2').onclick = (e) => App.openPop('popLayers', e.currentTarget, { alignRight: true });
$('#btnParts').onclick = (e) => App.openPop('popParts', e.currentTarget, { alignRight: true, onopen: () => { Studio.rig.refresh(); } });
$('#btnParams').onclick = (e) => { if (openPop === 'popParams') App.closePopups(); else Studio.rig.openParams(e.currentTarget); };

// ---------------- 模式 ----------------
App.setMode = (m) => { if (App.tool === 'move' && Tools.move.fl) Tools.move.apply(); if (App.mode === 'rig') Studio.rig.leave(); if (Studio.anim.playing) Studio.anim.stop(); App.closePopups(); App.mode = m; $$('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#barAnim').hidden = m !== 'anim'; $('#barRig').hidden = m !== 'rig'; $('#paintTools').hidden = m === 'rig'; $('#rigTools').hidden = m !== 'rig'; $('#side').hidden = m === 'rig';
  if (m !== 'paint' && (App.tool === 'select' || App.tool === 'lasso' || App.tool === 'move')) App.setTool('brush');
  if (m === 'rig') Studio.rig.enter(); else App.hint(TOOL_HINT[App.tool] || ''); if (m === 'anim') Studio.anim.refresh(); App.invalidate(); };
$$('#modes button').forEach(b => b.onclick = () => App.setMode(b.dataset.mode));

// ---------------- 頂欄 ----------------
App.undo = () => { if (App.tool === 'move' && Tools.move.fl) { Tools.move.discard(); return; } if (App.history.undo()) { App.refreshLayers(); App.invalidate(); App.dirty(); } else App.toast('沒有可復原的'); };
App.redo = () => { if (App.history.redo()) { App.refreshLayers(); App.invalidate(); App.dirty(); } };
App.history.onchange = () => { $('#btnUndo').style.opacity = App.history.undoS.length ? 1 : 0.4; $('#btnRedo').style.opacity = App.history.redoS.length ? 1 : 0.4; };
$('#btnUndo').onclick = App.undo; $('#btnRedo').onclick = App.redo;
$('#btnActions').onclick = (e) => { App.openPop('popActions', e.currentTarget, { onopen: () => { $('#popActions [data-act=symmetry]').classList.toggle('on', App.doc.symmetry); syncLayoutUI(); } }); };
// 版面：工具列位置與邊界留白（被 claude.ai 外框或瀏覽器列擋到時用），記在這台裝置
const LAYOUT_KEY = 'somnia-layout'; let layout = Object.assign({ bar: 'top', top: 0, bottom: 0, side: 0 }, JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'));
function applyLayout(){ document.body.classList.toggle('bar-bottom', layout.bar === 'bottom'); const r = document.documentElement.style; r.setProperty('--ins-top', layout.top + 'px'); r.setProperty('--ins-bottom', layout.bottom + 'px'); r.setProperty('--ins-side', layout.side + 'px'); localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); App.closePopups(); if (App.doc) setTimeout(App.fit, 50); }
function syncLayoutUI(){ $$('#popActions [data-layout]').forEach(b => b.classList.toggle('on', b.dataset.layout === layout.bar)); $('#insTop').value = layout.top; $('#insBottom').value = layout.bottom; $('#insSide').value = layout.side; ['insTop', 'insBottom', 'insSide'].forEach(id => $('#' + id).nextElementSibling.textContent = $('#' + id).value); }
$$('#popActions [data-layout]').forEach(b => b.onclick = () => { layout.bar = b.dataset.layout; applyLayout(); App.toast(layout.bar === 'bottom' ? '工具列移到下方' : '工具列移到上方'); });
[['insTop', 'top'], ['insBottom', 'bottom'], ['insSide', 'side']].forEach(([id, k]) => { const el = $('#' + id); el.oninput = (e) => { layout[k] = +e.target.value; e.target.nextElementSibling.textContent = e.target.value; const r = document.documentElement.style; r.setProperty('--ins-' + k, layout[k] + 'px'); }; el.onchange = () => { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); App.fit(); }; });
applyLayout();
$$('#popActions [data-act]').forEach(b => b.onclick = () => { App.closePopups(); App.menu(b.dataset.act); });
$('#btnGallery').onclick = () => openGallery();
$('#gClose').onclick = () => { $('#gallery').hidden = true; }; $('#gNew').onclick = () => { $('#gallery').hidden = true; newDialog(); };

// ---------------- 儲存與匯出 ----------------
let dirtyT = null; App.dirty = () => { clearTimeout(dirtyT); dirtyT = setTimeout(() => App.saveLocal(true), 4000); };
App.saveLocal = async (silent) => { const d = App.doc; if (!d) return; try { const { meta, blobs } = await Ser.pack(d); await Store.put({ id: d.id, name: d.name, updated: Date.now(), thumb: Ser.thumb(d, 160), w: d.w, h: d.h, meta, blobs }); if (!silent) App.toast('已儲存到本機'); } catch (e) { console.error(e); if (!silent) App.toast('儲存失敗：' + e.message); } };
document.addEventListener('visibilitychange', () => { if (document.hidden) App.saveLocal(true); });
App.saveFile = async (name, blob) => { const dl = App.cap.downloads; if (dl) { try { await dl.save({ filename: name, data: blob }); App.toast('已儲存 ' + name); return; } catch (e) { if (e && e.code === 'declined') return; if (e && e.code !== 'unavailable') { App.toast('無法儲存：' + (e.message || e.code)); return; } } } U.download(name, blob); };
async function zipLayers(){ const d = App.doc, zip = new JSZip(); const meta = { name: d.name, w: d.w, h: d.h, layers: [] }; d.layers.forEach((l, i) => { const file = `layers/${String(i).padStart(2, '0')}_${l.name.replace(/[^\w一-鿿-]+/g, '_')}.png`; zip.file(file, U.toBlob(l.canvas(d.frame))); meta.layers.push({ name: l.name, file, order: i, visible: l.visible, opacity: l.opacity, blend: l.blend, clip: l.clip, bbox: U.alphaBounds(l.canvas(d.frame)) }); }); zip.file('layers.json', JSON.stringify(meta, null, 2)); zip.file('merged.png', U.toBlob(Comp.render(d, U.mkCanvas(d.w, d.h)))); return zip.generateAsync({ type: 'blob' }); }
async function zipProject(){ const d = App.doc, zip = new JSZip(); const { meta, blobs } = await Ser.pack(d); zip.file('project.json', JSON.stringify(meta)); for (const k in blobs) zip.file('cels/' + k + '.png', blobs[k]); return zip.generateAsync({ type: 'blob' }); }
async function importProject(file){ const zip = await JSZip.loadAsync(file); const meta = JSON.parse(await zip.file('project.json').async('string')); const blobs = {}; for (const f of Object.keys(zip.files)) if (f.startsWith('cels/') && f.endsWith('.png')) blobs[f.slice(5, -4)] = await zip.file(f).async('blob'); const doc = await Ser.unpack(meta, blobs); doc.id = U.uid(); App.loadDoc(doc); App.toast('已匯入 ' + doc.name); }
async function zipRig(){ const d = App.doc, zip = new JSZip(); const data = Studio.rig.exportData(); d.layers.forEach((l, i) => { const b = data.parts[i].bbox; const c = U.mkCanvas(b.w, b.h); c.getContext('2d').drawImage(l.canvas(0), -b.x, -b.y); zip.file(data.parts[i].file, U.toBlob(c)); }); zip.file('rig.json', JSON.stringify(data, null, 1)); return zip.generateAsync({ type: 'blob' }); }
async function importImage(file){ const url = URL.createObjectURL(file); const im = await U.loadImage(url); const d = App.doc; structural(() => { const l = d.addLayer(file.name.replace(/\.[^.]+$/, '')); const s = Math.min(1, d.w / im.width, d.h / im.height); const w = im.width * s, h = im.height * s; l.canvas(0).getContext('2d').drawImage(im, (d.w - w) / 2, (d.h - h) / 2, w, h); }); URL.revokeObjectURL(url); }
$('#fileIn').onchange = (e) => { const f = e.target.files[0]; if (f) importImage(f); e.target.value = ''; };
$('#zipIn').onchange = (e) => { const f = e.target.files[0]; if (f) importProject(f).catch(err => App.toast('匯入失敗：' + err.message)); e.target.value = ''; };
$('#helpText').textContent = `畫圖：一指／筆畫；兩指拖＝平移縮放旋轉；兩指點＝復原；三指點＝重做；手指長按畫面＝吸色
頂欄右邊：筆刷／塗抹／橡皮擦（再點一次打開筆刷庫）、圖層、顏色（把顏色圓點拖到畫布上＝填色）
頂欄左邊：圖庫、動作（加入／畫布／分享）、調整（漸層、填色、吸色）、選取、變形
左側：筆刷大小、吸色、不透明度、復原、重做
滑鼠：滾輪縮放，Alt+滾輪旋轉，空白鍵拖＝平移。快捷鍵 B 筆刷 E 橡皮 U 塗抹 F 填色 G 漸層 I 吸色 S 選取 L 套索 M 變形 [ ] 大小 X 交換顏色 0 置中
圖層：點一下選取，再點一次開選單（複製、清除、鎖定透明度、剪裁遮罩、動畫圖層、合併、刪除）；長按拖曳排序；N 鈕＝不透明度與混合
公仔上色流程：底色平塗 → 新圖層設「剪裁遮罩」畫漸層 → 噴槍壓暗面 → 反光筆、硬邊高光 → 腮紅
動畫：「＋新增影格」會把目前圖層變成動畫圖層並加一格；沒有畫面的格子沿用前一格；設定裡有洋蔥皮與 FPS
骨架：零件＝圖層。「一鍵骨架」照名稱（head、eye、mouth、body、arm_L…）自動做頭轉、呼吸、眨眼
　　　手動：下面選一個動作，把滑桿拉到一端，拖零件（移動／角縮放／上方圓點旋轉）＝記錄那一端的姿勢；拉回中間看效果
　　　「零件」面板：父零件、網格變形、軸心。「▶ 試玩」會呼吸眨眼、跟著游標看
匯出（動作→分享）：PNG、ZIP（每層一張 PNG＋layers.json，給 Unity 2D Animation）、Sprite Sheet、骨架（零件＋rig.json）、專案檔`;

App.menu = async (act) => {
  const d = App.doc, nm = (d.name || 'somnia').replace(/[\\/:*?"<>|]+/g, '_');
  if (act === 'save') return App.saveLocal();
  if (act === 'rename') { const n = await App.prompt('專案名稱', d.name); if (n) { d.name = n; document.title = n + ' · 夢境畫室'; App.dirty(); } return; }
  if (act === 'fit') return App.fit();
  if (act === 'fullscreen') { const el = document.documentElement; const fs = document.fullscreenElement || document.webkitFullscreenElement; try { if (fs) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else (el.requestFullscreen || el.webkitRequestFullscreen).call(el); } catch (e) { App.toast('這個瀏覽器不讓網頁全螢幕；請用「加入主畫面」'); } return; }
  if (act === 'symmetry') { d.symmetry = !d.symmetry; App.toast(d.symmetry ? '左右對稱：開' : '左右對稱：關'); App.invalidate(); return; }
  if (act === 'import') return $('#fileIn').click();
  if (act === 'importProj') return $('#zipIn').click();
  if (act === 'exportPng') return App.saveFile(nm + '.png', await U.toBlob(Comp.render(d, U.mkCanvas(d.w, d.h))));
  if (act === 'exportLayers') { App.toast('打包中…'); return App.saveFile(nm + '_layers.zip', await zipLayers()); }
  if (act === 'exportSheet') { const s = Studio.anim.sheet(); const zip = new JSZip(); zip.file(nm + '_sheet.png', U.toBlob(s.canvas)); zip.file(nm + '_sheet.json', JSON.stringify({ frameW: d.w, frameH: d.h, frames: s.n, cols: s.cols, rows: s.rows, fps: d.fps })); return App.saveFile(nm + '_sheet.zip', await zip.generateAsync({ type: 'blob' })); }
  if (act === 'exportRig') { App.toast('打包中…'); return App.saveFile(nm + '_rig.zip', await zipRig()); }
  if (act === 'exportProj') { App.toast('打包中…'); return App.saveFile(nm + '.somnia.zip', await zipProject()); }
  if (act === 'cloudSave') return cloudSave();
  if (act === 'cloudOpen') return cloudOpen();
  if (act === 'resize') return resizeDialog();
};
function newDialog(){ const b = App.modal(`<h2>新建畫布</h2><div class="row"><label>預設 <select id="nPre"><option value="1000,1400">角色 1000×1400</option><option value="512,512">小怪／道具 512×512</option><option value="256,256">圖示 256×256</option><option value="1024,1024">正方 1024</option><option value="1920,1080">背景 1920×1080</option><option value="2048,1024">UI 圖集 2048×1024</option></select></label></div><div class="row"><label>寬 <input type="number" id="nW" value="1000" style="width:80px"></label><label>高 <input type="number" id="nH" value="1400" style="width:80px"></label></div><div class="row"><label class="grow">名稱 <input type="text" id="nName" class="grow" value="新角色"></label></div><div class="btns"><button class="sm" id="nNo">取消</button><button class="sm pri" id="nOk">建立</button></div>`);
  b.querySelector('#nPre').onchange = (e) => { const [w, h] = e.target.value.split(','); b.querySelector('#nW').value = w; b.querySelector('#nH').value = h; };
  b.querySelector('#nNo').onclick = App.closeModal; b.querySelector('#nOk').onclick = () => { const w = U.clamp(+b.querySelector('#nW').value || 1000, 16, 4096), h = U.clamp(+b.querySelector('#nH').value || 1400, 16, 4096); App.closeModal(); App.saveLocal(true); App.newDoc(w, h, b.querySelector('#nName').value.trim() || '未命名'); App.saveLocal(true); }; }
async function openGallery(){ await App.saveLocal(true); const list = (await Store.list()).sort((a, b) => b.updated - a.updated); const g = $('#gGrid'); g.innerHTML = ''; $('#gallery').hidden = false;
  list.forEach(p => { const it = document.createElement('div'); it.className = 'gitem'; it.innerHTML = `<div class="th"><img src="${p.thumb || ''}"></div><div class="nm">${p.name}</div><div class="meta">${p.w}×${p.h} · ${new Date(p.updated).toLocaleDateString()}</div><button class="del">✕</button>`;
    it.onclick = async () => { $('#gallery').hidden = true; if (p.id === App.doc.id) return; const rec = await Store.get(p.id); if (!rec) return; App.loadDoc(await Ser.unpack(rec.meta, rec.blobs)); };
    it.querySelector('.del').onclick = async (e) => { e.stopPropagation(); if (await App.confirm('刪除「' + p.name + '」？')) { await Store.del(p.id); openGallery(); } }; g.appendChild(it); });
  if (!list.length) g.innerHTML = '<div class="dim">還沒有專案，按「＋ 新畫布」</div>'; }
function resizeDialog(){ const d = App.doc; const b = App.modal(`<h2>畫布大小</h2><div class="row"><label>寬 <input type="number" id="rW" value="${d.w}" style="width:80px"></label><label>高 <input type="number" id="rH" value="${d.h}" style="width:80px"></label></div><div class="row"><label>錨點 <select id="rA"><option value="c">中央</option><option value="tl">左上</option><option value="t">上中</option><option value="b">下中</option></select></label></div><div class="btns"><button class="sm" onclick="Studio.app.closeModal()">取消</button><button class="sm pri" id="rOk">套用</button></div>`);
  b.querySelector('#rOk').onclick = () => { const w = U.clamp(+b.querySelector('#rW').value || d.w, 16, 4096), h = U.clamp(+b.querySelector('#rH').value || d.h, 16, 4096); const a = b.querySelector('#rA').value; const ox = a === 'tl' ? 0 : Math.round((w - d.w) / 2), oy = a === 'c' ? Math.round((h - d.h) / 2) : a === 'b' ? h - d.h : 0; for (const l of d.layers) l.resizeAll(w, h, ox, oy); d.w = w; d.h = h; App.closeModal(); App.loadDoc(d); App.dirty(); }; }

// ---------------- 雲端（artifact 能力：assets + db）----------------
async function initCaps(){ if (!window.claude || !claude.use) return; try { App.cap.downloads = await claude.use('downloads'); } catch (e) {} try { App.cap.assets = await claude.use('assets'); App.cap.db = await claude.use('db'); } catch (e) {} }
async function cloudSave(){ const { assets, db } = App.cap; if (!assets || !db) { App.toast('這裡沒有雲端功能（請用 claude.ai 的連結開啟）'); return; } const d = App.doc; App.toast('上傳中…');
  try { const { meta, blobs } = await Ser.pack(d, true); const blob = new Blob([JSON.stringify({ meta, blobs })], { type: 'application/json' }); const r = await assets.upload(blob, { contentType: 'application/json' }); const ref = db.doc('projects/' + d.id); const old = await ref.get(); await ref.set({ name: d.name, assetId: r.id, url: r.url, updated: Date.now(), w: d.w, h: d.h, layers: d.layers.map(l => l.name), thumb: Ser.thumb(d, 64) });
    const prev = old.exists && old.data() && old.data().assetId; if (prev && prev !== r.id) { try { await assets.delete(prev); } catch (e) {} } App.toast('已上傳到雲端'); } catch (e) { console.error(e); App.toast('上傳失敗：' + (e.message || e.code || e)); } }
async function cloudOpen(){ const { db } = App.cap; if (!db) { App.toast('這裡沒有雲端功能'); return; } const snap = await db.collection('projects').get(); const items = snap.docs.map(s => ({ id: s.id, ...s.data() })).sort((a, b) => b.updated - a.updated);
  const b = App.modal(`<h2>雲端專案</h2><div class="list">${items.map(p => `<div class="it" data-url="${p.url}" data-id="${p.id}"><img src="${p.thumb || ''}"><div class="nm">${p.name}<div class="dim small">${p.w}×${p.h} · ${new Date(p.updated).toLocaleString()}</div></div></div>`).join('') || '<div class="dim">雲端還沒有專案</div>'}</div><div class="btns"><button class="sm" onclick="Studio.app.closeModal()">關閉</button></div>`);
  b.querySelectorAll('.it').forEach(it => it.onclick = async () => { App.closeModal(); App.toast('下載中…'); try { const j = await (await fetch(it.dataset.url)).json(); await App.saveLocal(true); const doc = await Ser.unpack(j.meta, j.blobs); App.loadDoc(doc); } catch (e) { App.toast('開啟失敗：' + e.message); } }); }

// ---------------- 繪製迴圈 ----------------
let checker = null; function mkChecker(){ const c = U.mkCanvas(16, 16), x = c.getContext('2d'); x.fillStyle = '#6a6488'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#8c86b0'; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8); checker = App.screen.getContext('2d').createPattern(c, 'repeat'); }
let needDraw = true; App.compDirty = true;
App.invalidate = () => { needDraw = true; App.compDirty = true; };
function resize(){ const r = App.stage.getBoundingClientRect(); App.screen.width = Math.round(r.width * DPR); App.screen.height = Math.round(r.height * DPR); needDraw = true; }
new ResizeObserver(() => { resize(); needDraw = true; }).observe(App.stage); resize();
let thumbT = 0;
function draw(now){
  requestAnimationFrame(draw);
  if (App.sel) needDraw = true;
  if (!needDraw || !App.doc) return; needDraw = false;
  const d = App.doc, scr = App.screen, x = scr.getContext('2d'), v = App.view; if (!checker) mkChecker();
  x.setTransform(DPR, 0, 0, DPR, 0, 0); x.fillStyle = '#0d0b20'; x.fillRect(0, 0, scr.width / DPR, scr.height / DPR);
  x.translate(v.x, v.y); x.rotate(v.r); x.scale(v.s, v.s);
  x.save(); x.fillStyle = checker; x.scale(1 / v.s, 1 / v.s); x.fillRect(0, 0, d.w * v.s, d.h * v.s); x.restore();
  if (App.compDirty) { App.compDirty = false; let ov = null, tmp = null; if (App.preview && d.active) { tmp = App.preview(d.active.canvas(d.frame)); ov = { [d.active.id]: tmp }; } if (App.mode === 'rig') Studio.rig.render(d, App.composite); else Comp.render(d, App.composite, { override: ov, onion: App.mode === 'anim' && d.onion }); if (tmp) Comp.free(tmp); }
  x.imageSmoothingEnabled = v.s < 4; x.drawImage(App.composite, 0, 0); x.imageSmoothingEnabled = true;
  x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 1 / v.s; x.strokeRect(0, 0, d.w, d.h);
  if (d.symmetry && App.mode !== 'rig') { x.strokeStyle = 'rgba(255,183,213,0.7)'; x.setLineDash([8 / v.s, 6 / v.s]); x.beginPath(); x.moveTo(d.w / 2, 0); x.lineTo(d.w / 2, d.h); x.stroke(); x.setLineDash([]); }
  if (App.sel) { x.lineWidth = 1 / v.s; x.strokeStyle = '#000'; x.stroke(App.sel.path); x.strokeStyle = '#fff'; x.setLineDash([6 / v.s, 6 / v.s]); x.lineDashOffset = -(now / 40) / v.s; x.stroke(App.sel.path); x.setLineDash([]); }
  const t = Tools[App.tool]; if (App.mode !== 'rig' && t && t.overlay) t.overlay(x);
  if (App.mode === 'rig') Studio.rig.overlay(x);
  x.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (App.cursor && App.mode !== 'rig' && ['brush', 'eraser', 'smudge'].includes(App.tool) && App.lastPointerType !== 'touch') { const r = Brush.s.size / 2 * v.s; x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 1; x.beginPath(); x.arc(App.cursor.x, App.cursor.y, Math.max(2, r), 0, Math.PI * 2); x.stroke(); x.strokeStyle = 'rgba(0,0,0,0.5)'; x.beginPath(); x.arc(App.cursor.x, App.cursor.y, Math.max(2, r) + 1, 0, Math.PI * 2); x.stroke(); }
  if (now - thumbT > 400) { thumbT = now; updateThumbs(); }
}
requestAnimationFrame(draw);

// ---------------- 啟動 ----------------
(async function start(){
  renderSwatches(); applyColor(); syncSliders(); App.hint(TOOL_HINT.brush); Studio.anim.init(); Studio.rig.init(); App.history.onchange();
  Object.assign(Brush.s, Brush.library[0].items[0].s);
  initCaps();
  let loaded = false; try { const last = localStorage.getItem('somnia-last'); if (last) { const rec = await Store.get(last); if (rec) { App.loadDoc(await Ser.unpack(rec.meta, rec.blobs)); loaded = true; } } } catch (e) { console.error(e); }
  if (!loaded) { App.newDoc(1000, 1400, '新角色'); newDialog(); }
})();
})();
