'use strict';
// ======================================================================
//  輸入：指標事件、壓力、兩指手勢（平移／縮放／旋轉／兩指點復原）、滾輪、鍵盤
// ======================================================================
(function(){
const App = Studio.app, U = Studio.util;
App.screen = document.getElementById('screen'); App.stage = document.getElementById('stage');

App.view = { x: 0, y: 0, s: 1, r: 0 };
App.docToScreen = (p) => { const v = App.view, c = Math.cos(v.r), s = Math.sin(v.r); return { x: v.x + (p.x * c - p.y * s) * v.s, y: v.y + (p.x * s + p.y * c) * v.s }; };
App.screenToDoc = (p) => { const v = App.view, c = Math.cos(-v.r), s = Math.sin(-v.r); const x = (p.x - v.x) / v.s, y = (p.y - v.y) / v.s; return { x: x * c - y * s, y: x * s + y * c }; };
App.fit = () => { const st = App.stage.getBoundingClientRect(); const d = App.doc; const s = Math.min((st.width - 40) / d.w, (st.height - 40) / d.h); App.view = { s, r: 0, x: (st.width - d.w * s) / 2, y: (st.height - d.h * s) / 2 }; App.invalidate(); };
App.zoomAt = (sp, k) => { const v = App.view; const ns = U.clamp(v.s * k, 0.05, 32); const f = ns / v.s; v.x = sp.x - (sp.x - v.x) * f; v.y = sp.y - (sp.y - v.y) * f; v.s = ns; App.invalidate(); };

const ptrs = new Map(); // pointerId -> {x,y,type}
let strokePtr = null, gesture = null, lpTimer = null, lpStart = null, space = false, panDrag = null;
const localPt = (ev) => { const r = App.screen.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
const pressureOf = (ev) => ev.pointerType === 'pen' ? U.clamp(ev.pressure || 0.5, 0.02, 1) : 1;

function tool(){ return Studio.tools[App.tool]; }
function cancelStroke(){ if (strokePtr != null) { const t = tool(); t && t.cancel && t.cancel(); strokePtr = null; } }

App.screen.addEventListener('pointerdown', (ev) => {
  ev.preventDefault(); try { App.screen.setPointerCapture(ev.pointerId); } catch (e) {} App.closePopups && App.closePopups();
  const sp = localPt(ev); ptrs.set(ev.pointerId, { x: sp.x, y: sp.y, type: ev.pointerType, t: performance.now() });
  App.cursor = sp; App.lastPointerType = ev.pointerType;
  if (ev.pointerType === 'touch' && ptrs.size >= 2) { // 第二根手指：進入手勢
    if (strokePtr != null && ptrs.get(strokePtr) && ptrs.get(strokePtr).type === 'touch') cancelStroke();
    clearTimeout(lpTimer); startGesture(); return;
  }
  if (gesture) return;
  if (ev.button === 1 || ev.button === 2 || space) { panDrag = { p0: sp, v0: { x: App.view.x, y: App.view.y } }; return; }
  if (strokePtr != null) return; // 已經有一支筆在畫（手掌誤觸）
  if (App.mode === 'rig') { if (Studio.rig.pointerDown(App.screenToDoc(sp), ev)) { strokePtr = ev.pointerId; App.rigDrag = true; } else panDrag = { p0: sp, v0: { x: App.view.x, y: App.view.y } }; return; }
  strokePtr = ev.pointerId; App.rigDrag = false;
  const t = tool(); t && t.down && t.down(App.screenToDoc(sp), pressureOf(ev), ev);
  if (ev.pointerType === 'touch' && !['picker', 'hand', 'move', 'select', 'lasso'].includes(App.tool)) { // 手指長按 = 吸色
    lpStart = sp; lpTimer = setTimeout(() => { if (strokePtr === ev.pointerId) { cancelStroke(); strokePtr = ev.pointerId; App.pickerReturn = App.tool; App.setTool('picker'); Studio.tools.picker.pick(App.screenToDoc(sp)); } }, 450);
  }
});
App.screen.addEventListener('pointermove', (ev) => {
  const sp = localPt(ev); const rec = ptrs.get(ev.pointerId); if (rec) { rec.x = sp.x; rec.y = sp.y; }
  App.cursor = sp; if (!rec) { App.invalidate(); return; }
  if (gesture) { updateGesture(); return; }
  if (panDrag) { App.view.x = panDrag.v0.x + sp.x - panDrag.p0.x; App.view.y = panDrag.v0.y + sp.y - panDrag.p0.y; App.invalidate(); return; }
  if (strokePtr !== ev.pointerId) return;
  if (lpTimer && lpStart && U.dist(sp, lpStart) > 8) { clearTimeout(lpTimer); lpTimer = null; }
  if (App.rigDrag) { Studio.rig.pointerMove(App.screenToDoc(sp), ev); return; }
  const t = tool(); if (!t || !t.move) return;
  const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]; if (!evs.length) evs.push(ev);
  for (const e of evs) t.move(App.screenToDoc(localPt(e)), pressureOf(e), e);
  App.invalidate();
});
function endPtr(ev){
  const sp = localPt(ev); const rec = ptrs.get(ev.pointerId); ptrs.delete(ev.pointerId);
  clearTimeout(lpTimer); lpTimer = null;
  if (gesture) { if (ptrs.size === 0) endGesture(); return; }
  if (panDrag) { if (ptrs.size === 0) panDrag = null; return; }
  if (strokePtr === ev.pointerId) { strokePtr = null; if (App.rigDrag) { App.rigDrag = false; Studio.rig.pointerUp(App.screenToDoc(sp), ev); } else { const t = tool(); t && t.up && t.up(App.screenToDoc(sp), pressureOf(ev), ev); } App.invalidate(); }
  void rec;
}
App.screen.addEventListener('pointerup', endPtr); App.screen.addEventListener('pointercancel', endPtr);
App.screen.addEventListener('contextmenu', e => e.preventDefault());

// ---- 兩指手勢 ----
function gestureState(){ const a = [...ptrs.values()]; const p0 = a[0], p1 = a[1]; return { cx: (p0.x + p1.x) / 2, cy: (p0.y + p1.y) / 2, d: Math.hypot(p1.x - p0.x, p1.y - p0.y), a: Math.atan2(p1.y - p0.y, p1.x - p0.x) }; }
function startGesture(){ const g = gestureState(); gesture = { ...g, v0: { ...App.view }, t0: performance.now(), moved: 0, maxN: ptrs.size, zoomRig: App.mode === 'rig' && Studio.rig.sel && !Studio.rig.pivotMode }; }
function updateGesture(){ if (ptrs.size < 2) return; const g = gestureState(), G = gesture; G.maxN = Math.max(G.maxN, ptrs.size); G.moved = Math.max(G.moved, Math.hypot(g.cx - G.cx, g.cy - G.cy), Math.abs(g.d - G.d));
  const k = g.d / Math.max(1, G.d); let da = g.a - G.a; const v0 = G.v0; const ns = U.clamp(v0.s * k, 0.05, 32); const kk = ns / v0.s;
  const rot = App.rotateLock ? 0 : da; const c = Math.cos(rot), s = Math.sin(rot);
  const ox = G.cx - v0.x, oy = G.cy - v0.y; const rx = (ox * c - oy * s) * kk, ry = (ox * s + oy * c) * kk;
  App.view = { s: ns, r: v0.r + rot, x: g.cx - rx, y: g.cy - ry }; App.invalidate(); }
function endGesture(){ const G = gesture; gesture = null; const dt = performance.now() - G.t0; if (dt < 350 && G.moved < 12) { App.view = { ...G.v0 }; if (G.maxN === 2) App.undo(); else if (G.maxN >= 3) App.redo(); } App.invalidate(); }

// ---- 滑鼠滾輪 ----
App.screen.addEventListener('wheel', (ev) => { ev.preventDefault(); const sp = localPt(ev); if (ev.altKey) { App.view.r += ev.deltaY * 0.002; App.invalidate(); return; } App.zoomAt(sp, Math.exp(-ev.deltaY * 0.0015)); }, { passive: false });

// ---- 鍵盤 ----
const KEYS = { b: 'brush', e: 'eraser', u: 'smudge', f: 'fill', g: 'gradient', i: 'picker', s: 'select', l: 'lasso', m: 'move', h: 'hand' };
addEventListener('keydown', (ev) => {
  const tag = (ev.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  const k = ev.key.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
  if (k === ' ') { space = true; ev.preventDefault(); return; }
  if (mod && k === 'z') { ev.preventDefault(); ev.shiftKey ? App.redo() : App.undo(); return; }
  if (mod && k === 'y') { ev.preventDefault(); App.redo(); return; }
  if (mod && k === 's') { ev.preventDefault(); App.saveLocal(); return; }
  if (mod && k === 'd') { ev.preventDefault(); App.sel = null; App.invalidate(); return; }
  if (mod && k === 'a') { ev.preventDefault(); const d = App.doc; const p = new Path2D(); p.rect(0, 0, d.w, d.h); App.sel = { path: p, bbox: { x: 0, y: 0, w: d.w, h: d.h } }; App.invalidate(); return; }
  if (mod) return;
  if (k === 'escape') { if (App.tool === 'move' && Studio.tools.move.fl) Studio.tools.move.discard(); else App.sel = null; App.closePopups(); App.invalidate(); return; }
  if (k === 'enter' && App.tool === 'move') { Studio.tools.move.apply(); return; }
  if (k === '[') { App.setBrush('size', Math.max(1, Math.round(Studio.brush.s.size * 0.85))); return; }
  if (k === ']') { App.setBrush('size', Math.min(300, Math.round(Studio.brush.s.size * 1.18) + 1)); return; }
  if (k === 'x') { App.swapColors(); return; }
  if (k === '0') { App.fit(); return; }
  if (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown') { const dx = k === 'arrowleft' ? -1 : k === 'arrowright' ? 1 : 0, dy = k === 'arrowup' ? -1 : k === 'arrowdown' ? 1 : 0; if (App.tool === 'move' && Studio.tools.move.fl) { Studio.tools.move.nudge(dx * (ev.shiftKey ? 10 : 1), dy * (ev.shiftKey ? 10 : 1)); ev.preventDefault(); } else if (App.mode === 'anim' && dx) { Studio.anim.go(App.doc.frame + dx); ev.preventDefault(); } return; }
  if (k === ',' || k === '.') { if (App.mode === 'anim') Studio.anim.go(App.doc.frame + (k === ',' ? -1 : 1)); return; }
  if (KEYS[k]) { App.setTool(KEYS[k]); return; }
});
addEventListener('keyup', (ev) => { if (ev.key === ' ') space = false; });
})();
