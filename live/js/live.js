'use strict';
// ======================================================================
//  夢偶 Live（第一段：App 骨幹、視圖、輸入、繪製）。rig.js 會接在後面用這裡的 App。
// ======================================================================
(function(){
const App = Studio.app = Studio.app || {}; const U = Studio.util, Comp = Studio.comp;
const $ = (s) => document.querySelector(s);
App.screen = $('#screen'); App.stage = $('#stage'); App.mode = 'rig'; App.tool = 'rig'; App.doc = null; App.sel = null; App.preview = null; App.cursor = null; App.history = new Studio.History();
App.view = { x: 0, y: 0, s: 1, r: 0 };
const DPR = Math.min(2, window.devicePixelRatio || 1);
// ---- 小工具 ----
let toastT; App.toast = (s) => { const t = $('#toast'); t.textContent = s; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2000); };
let hintS = ''; App.hint = (s) => { if (s === hintS) return; hintS = s; $('#hint').textContent = s; };
App.modal = (html) => { const d = $('#dialog'), box = d.querySelector('.box'); box.innerHTML = html; d.hidden = false; return box; };
App.closeModal = () => { $('#dialog').hidden = true; };
App.prompt = (msg, def) => new Promise(res => { const b = App.modal(`<h2>${msg}</h2><div class="row"><input type="text" id="pIn" class="grow" value="${(def || '').replace(/"/g, '&quot;')}"></div><div class="btns"><button class="sm" id="pNo">取消</button><button class="sm pri" id="pOk">確定</button></div>`); const inp = b.querySelector('#pIn'); inp.focus(); inp.select(); const ok = () => { App.closeModal(); res(inp.value.trim()); }; b.querySelector('#pOk').onclick = ok; inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') { App.closeModal(); res(null); } }; b.querySelector('#pNo').onclick = () => { App.closeModal(); res(null); }; });
App.confirm = (msg) => new Promise(res => { const b = App.modal(`<h2 style="white-space:pre-wrap;font-size:14px;line-height:1.6">${msg}</h2><div class="btns"><button class="sm" id="pNo">取消</button><button class="sm pri" id="pOk">確定</button></div>`); b.querySelector('#pOk').onclick = () => { App.closeModal(); res(true); }; b.querySelector('#pNo').onclick = () => { App.closeModal(); res(false); }; });
$('#dialog').addEventListener('pointerdown', (e) => { if (e.target === e.currentTarget) App.closeModal(); });
let openPop = null; App.openPop = (id, anchor, opts = {}) => { const el = $('#' + id); if (!el) return; App.closePopups(); el.hidden = false; openPop = id; const r = anchor ? anchor.getBoundingClientRect() : { left: 8, right: 8, top: 46, bottom: 46 }; const w = el.offsetWidth, h = el.offsetHeight; const above = r.top > innerHeight * 0.6; let x = opts.alignRight ? r.right - w : r.left, y = above ? r.top - h - 6 : r.bottom + 6; x = U.clamp(x, 6, innerWidth - w - 6); y = U.clamp(y, 6, innerHeight - h - 6); el.style.left = x + 'px'; el.style.top = y + 'px'; };
App.closePopups = () => { document.querySelectorAll('.pop').forEach(p => p.hidden = true); openPop = null; };
document.addEventListener('pointerdown', (e) => { if (openPop && !e.target.closest('.pop') && !e.target.closest('#top')) App.closePopups(); }, true);
App.dirty = () => { clearTimeout(App._dt); App._dt = setTimeout(() => App.saveLocal(true), 4000); };
App.cap = { downloads: null }; if (window.claude && claude.use) { claude.use('downloads').then(d => { App.cap.downloads = d; }).catch(() => {}); }
App.saveFile = async (name, blob) => { const dl = App.cap.downloads; if (dl) { try { await dl.save({ filename: name, data: blob }); App.toast('已儲存 ' + name); return; } catch (e) { if (e && e.code === 'declined') return; } } U.download(name, blob); };
App.setProgress = (p) => { const el = $('#progress'); el.style.width = (p * 100) + '%'; if (p >= 1) setTimeout(() => el.style.width = '0', 400); };
// ---- 視圖 ----
App.docToScreen = (p) => { const v = App.view, c = Math.cos(v.r), s = Math.sin(v.r); return { x: v.x + (p.x * c - p.y * s) * v.s, y: v.y + (p.x * s + p.y * c) * v.s }; };
App.screenToDoc = (p) => { const v = App.view, c = Math.cos(-v.r), s = Math.sin(-v.r); const x = (p.x - v.x) / v.s, y = (p.y - v.y) / v.s; return { x: x * c - y * s, y: x * s + y * c }; };
App.fit = () => { if (!App.doc) return; const st = App.stage.getBoundingClientRect(); const d = App.doc; const s = Math.min((st.width - 40) / d.w, (st.height - 40) / d.h); App.view = { s, r: 0, x: (st.width - d.w * s) / 2, y: (st.height - d.h * s) / 2 }; App.invalidate(); };
App.zoomAt = (sp, k) => { const v = App.view; const ns = U.clamp(v.s * k, 0.05, 32); const f = ns / v.s; v.x = sp.x - (sp.x - v.x) * f; v.y = sp.y - (sp.y - v.y) * f; v.s = ns; App.invalidate(); };
// ---- 輸入：一指拖零件／平移，兩指縮放旋轉，滾輪縮放 ----
const ptrs = new Map(); let dragPtr = null, gesture = null, pan = null;
const localPt = (ev) => { const r = App.screen.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
App.screen.addEventListener('pointerdown', (ev) => { ev.preventDefault(); try { App.screen.setPointerCapture(ev.pointerId); } catch (e) {} App.closePopups(); const sp = localPt(ev); ptrs.set(ev.pointerId, { x: sp.x, y: sp.y }); App.cursor = sp; if (!App.doc) return;
  if (ev.pointerType === 'touch' && ptrs.size >= 2) { if (dragPtr != null) { Studio.rig.drag = null; dragPtr = null; } const a = [...ptrs.values()]; gesture = { cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2, d: Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y), a: Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x), v0: { ...App.view } }; return; }
  if (gesture || dragPtr != null) return;
  if (ev.button === 1 || ev.button === 2) { pan = { p0: sp, v0: { x: App.view.x, y: App.view.y } }; return; }
  if (Studio.rig.pointerDown(App.screenToDoc(sp), ev)) { dragPtr = ev.pointerId; } else pan = { p0: sp, v0: { x: App.view.x, y: App.view.y } }; });
App.screen.addEventListener('pointermove', (ev) => { const sp = localPt(ev); const rec = ptrs.get(ev.pointerId); if (rec) { rec.x = sp.x; rec.y = sp.y; } App.cursor = sp; if (!App.doc) return;
  if (gesture && ptrs.size >= 2) { const a = [...ptrs.values()]; const cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2, d = Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y), an = Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x); const G = gesture, v0 = G.v0; const ns = U.clamp(v0.s * d / Math.max(1, G.d), 0.05, 32), kk = ns / v0.s, rot = an - G.a, c = Math.cos(rot), s = Math.sin(rot); const ox = G.cx - v0.x, oy = G.cy - v0.y; App.view = { s: ns, r: v0.r + rot, x: cx - (ox * c - oy * s) * kk, y: cy - (ox * s + oy * c) * kk }; App.invalidate(); return; }
  if (pan) { App.view.x = pan.v0.x + sp.x - pan.p0.x; App.view.y = pan.v0.y + sp.y - pan.p0.y; App.invalidate(); return; }
  if (dragPtr === ev.pointerId) { Studio.rig.pointerMove(App.screenToDoc(sp), ev); return; }
  if (Studio.rig.trying) App.invalidate(); });
const up = (ev) => { ptrs.delete(ev.pointerId); if (gesture) { if (ptrs.size === 0) gesture = null; return; } if (pan) { if (ptrs.size === 0) pan = null; return; } if (dragPtr === ev.pointerId) { dragPtr = null; Studio.rig.pointerUp(App.screenToDoc(localPt(ev)), ev); App.invalidate(); } };
App.screen.addEventListener('pointerup', up); App.screen.addEventListener('pointercancel', up); App.screen.addEventListener('contextmenu', e => e.preventDefault());
App.screen.addEventListener('wheel', (ev) => { ev.preventDefault(); const sp = localPt(ev); if (ev.altKey) { App.view.r += ev.deltaY * 0.002; App.invalidate(); return; } App.zoomAt(sp, Math.exp(-ev.deltaY * 0.0015)); }, { passive: false });
addEventListener('keydown', (ev) => { const tag = (ev.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select') return; if (ev.key === '0') App.fit(); if (ev.key === 'Escape') { App.closeModal(); App.closePopups(); } });
// ---- 繪製 ----
let checker = null, needDraw = true; App.compDirty = true; App.invalidate = () => { needDraw = true; App.compDirty = true; };
function resize(){ const r = App.stage.getBoundingClientRect(); App.screen.width = Math.round(r.width * DPR); App.screen.height = Math.round(r.height * DPR); needDraw = true; }
new ResizeObserver(() => { resize(); }).observe(App.stage); resize();
function draw(){ requestAnimationFrame(draw); if (!needDraw || !App.doc) return; needDraw = false; const d = App.doc, x = App.screen.getContext('2d'), v = App.view;
  if (!checker) { const c = U.mkCanvas(16, 16), cx = c.getContext('2d'); cx.fillStyle = '#6a6488'; cx.fillRect(0, 0, 16, 16); cx.fillStyle = '#8c86b0'; cx.fillRect(0, 0, 8, 8); cx.fillRect(8, 8, 8, 8); checker = x.createPattern(c, 'repeat'); }
  x.setTransform(DPR, 0, 0, DPR, 0, 0); x.fillStyle = '#0d0b20'; x.fillRect(0, 0, App.screen.width / DPR, App.screen.height / DPR); x.translate(v.x, v.y); x.rotate(v.r); x.scale(v.s, v.s);
  x.save(); x.fillStyle = checker; x.scale(1 / v.s, 1 / v.s); x.fillRect(0, 0, d.w * v.s, d.h * v.s); x.restore();
  if (App.compDirty) { App.compDirty = false; Studio.rig.render(d, App.composite); }
  x.imageSmoothingEnabled = v.s < 4; x.drawImage(App.composite, 0, 0); x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 1 / v.s; x.strokeRect(0, 0, d.w, d.h);
  Studio.rig.overlay(x); }
requestAnimationFrame(draw);
})();
