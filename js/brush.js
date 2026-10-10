'use strict';
// ======================================================================
//  筆刷引擎與工具：筆刷／噴槍／點點／橡皮擦／塗抹／填色／漸層／吸色／選取／變形
// ======================================================================
(function(){
const App = Studio.app = Studio.app || {};
const U = Studio.util, Comp = Studio.comp;

const Brush = Studio.brush = {
  presets: {
    brush:  { size: 24, opacity: 1, hardness: 0.92, spacing: 0.1, streamline: 0.35, smooth: 0.15, filter: 0.1, scatter: 0, count: 1, tip: 'circle', pSize: true, pOp: false },
    soft:   { size: 90, opacity: 0.35, hardness: 0, spacing: 0.08, streamline: 0.2, smooth: 0, filter: 0, scatter: 0, count: 1, tip: 'circle', pSize: false, pOp: true },
    dots:   { size: 40, opacity: 1, hardness: 1, spacing: 0.5, streamline: 0, smooth: 0, filter: 0, scatter: 180, count: 4, tip: 'circle', pSize: true, pOp: false },
    eraser: { size: 40, opacity: 1, hardness: 0.9, spacing: 0.1, streamline: 0.3, smooth: 0.1, filter: 0.1, scatter: 0, count: 1, tip: 'circle', pSize: true, pOp: false },
    smudge: { size: 40, opacity: 0.6, hardness: 0.5, spacing: 0.15, streamline: 0.3, smooth: 0, filter: 0, scatter: 0, count: 1, tip: 'circle', pSize: false, pOp: false },
  },
  // 筆刷庫（Procreate 式分組）。筆刷、塗抹、橡皮擦共用同一個庫。
  library: [
    { set: '上墨', items: [
      { n: '平塗筆', d: '底色平塗', s: { size: 24, hardness: 0.95, opacity: 1, spacing: 0.08, streamline: 0.35, pSize: true, pOp: false, tip: 'circle', scatter: 0, count: 1 } },
      { n: '色線筆', d: '細色線、縫線（抖動修正強）', s: { size: 6, hardness: 1, opacity: 1, spacing: 0.06, streamline: 0.6, smooth: 0.35, filter: 0.3, pSize: true, pOp: false, tip: 'circle', scatter: 0, count: 1 } },
      { n: '硬邊高光', d: '塑膠光澤亮點', s: { size: 12, hardness: 1, opacity: 1, spacing: 0.08, streamline: 0.3, pSize: false, pOp: false, tip: 'circle', scatter: 0, count: 1 } },
      { n: '鉛筆', d: '草稿', s: { size: 5, hardness: 0.7, opacity: 0.8, spacing: 0.1, streamline: 0.2, pSize: true, pOp: true, tip: 'circle', scatter: 0, count: 1 } },
    ] },
    { set: '噴槍', items: [
      { n: '軟噴槍', d: '柔和暗面', s: { size: 120, hardness: 0, opacity: 0.3, spacing: 0.08, streamline: 0.2, pSize: false, pOp: true, tip: 'circle', scatter: 0, count: 1 } },
      { n: '腮紅', d: '大而柔的粉色暈', s: { size: 180, hardness: 0, opacity: 0.18, spacing: 0.1, streamline: 0.2, pSize: false, pOp: true, tip: 'circle', scatter: 0, count: 1 } },
      { n: '反光筆', d: '背光邊緣一條亮色', s: { size: 40, hardness: 0.3, opacity: 0.5, spacing: 0.08, streamline: 0.5, pSize: true, pOp: true, tip: 'circle', scatter: 0, count: 1 } },
    ] },
    { set: '質感', items: [
      { n: '點點', d: '散佈小點', s: { size: 30, hardness: 1, opacity: 1, spacing: 0.5, streamline: 0, pSize: true, pOp: false, tip: 'circle', scatter: 160, count: 5 } },
      { n: '星砂', d: '閃亮碎星', s: { size: 36, hardness: 1, opacity: 1, spacing: 0.6, streamline: 0, pSize: true, pOp: false, tip: 'sparkle', scatter: 220, count: 3 } },
      { n: '噪點', d: '霧面顆粒', s: { size: 60, hardness: 1, opacity: 0.35, spacing: 0.3, streamline: 0, pSize: false, pOp: true, tip: 'circle', scatter: 300, count: 12 } },
    ] },
    { set: '網點', items: [
      { n: '網點 60線', d: '細網點', s: { size: 80, hardness: 1, opacity: 1, spacing: 0.1, streamline: 0.2, pSize: true, pOp: false, tip: 'circle', scatter: 0, count: 1, tone: { pitch: 5, density: 0.4, angle: 45, shape: 'dot' } } },
      { n: '網點 40線', d: '中網點', s: { size: 100, hardness: 1, opacity: 1, spacing: 0.1, streamline: 0.2, pSize: true, pOp: false, tip: 'circle', scatter: 0, count: 1, tone: { pitch: 8, density: 0.45, angle: 45, shape: 'dot' } } },
      { n: '網點 20線', d: '粗網點', s: { size: 120, hardness: 1, opacity: 1, spacing: 0.1, streamline: 0.2, pSize: true, pOp: false, tip: 'circle', scatter: 0, count: 1, tone: { pitch: 16, density: 0.45, angle: 45, shape: 'dot' } } },
      { n: '線網', d: '平行線', s: { size: 100, hardness: 1, opacity: 1, spacing: 0.1, streamline: 0.2, pSize: true, pOp: false, tip: 'circle', scatter: 0, count: 1, tone: { pitch: 8, density: 0.35, angle: 45, shape: 'line' } } },
      { n: '交叉網', d: '交叉線', s: { size: 100, hardness: 1, opacity: 1, spacing: 0.1, streamline: 0.2, pSize: true, pOp: false, tip: 'circle', scatter: 0, count: 1, tone: { pitch: 8, density: 0.3, angle: 45, shape: 'cross' } } },
      { n: '方網', d: '方點', s: { size: 100, hardness: 1, opacity: 1, spacing: 0.1, streamline: 0.2, pSize: true, pOp: false, tip: 'circle', scatter: 0, count: 1, tone: { pitch: 10, density: 0.4, angle: 0, shape: 'square' } } },
      { n: '柔邊網點', d: '邊緣淡出', s: { size: 160, hardness: 0, opacity: 1, spacing: 0.08, streamline: 0.2, pSize: false, pOp: true, tip: 'circle', scatter: 0, count: 1, tone: { pitch: 7, density: 0.45, angle: 45, shape: 'dot' } } },
    ] },
    { set: '印章', items: [
      { n: '四角星', d: '夢的符號', s: { size: 48, hardness: 1, opacity: 1, spacing: 1.2, streamline: 0, pSize: true, pOp: false, tip: 'star', scatter: 0, count: 1 } },
      { n: '新月', d: '', s: { size: 48, hardness: 1, opacity: 1, spacing: 1.3, streamline: 0, pSize: true, pOp: false, tip: 'moon', scatter: 0, count: 1 } },
      { n: '愛心', d: '', s: { size: 40, hardness: 1, opacity: 1, spacing: 1.3, streamline: 0, pSize: true, pOp: false, tip: 'heart', scatter: 0, count: 1 } },
      { n: '閃光', d: '', s: { size: 36, hardness: 0.9, opacity: 1, spacing: 1.4, streamline: 0, pSize: true, pOp: false, tip: 'sparkle', scatter: 0, count: 1 } },
    ] },
  ],
  current: { brush: '平塗筆', eraser: '平塗筆', smudge: '軟噴槍' },
  per: {}, // 每個工具自己的設定
  s: null,
  cache: new Map(),
  init(){ for (const k in this.presets) this.per[k] = Object.assign({}, this.presets[k]); this.s = this.per.brush; },
  use(tool){ if (this.per[tool]) this.s = this.per[tool]; },
  // 128px 的筆尖圖，依筆尖形狀、硬度、顏色快取
  dab(tip, hardness, rgb){
    const key = tip + '|' + hardness.toFixed(2) + '|' + rgb.join(',');
    let c = this.cache.get(key); if (c) return c;
    if (this.cache.size > 60) this.cache.clear();
    c = U.mkCanvas(128, 128); const x = c.getContext('2d'); const col = U.rgba(rgb, 1), col0 = U.rgba(rgb, 0);
    if (tip === 'circle') {
      if (hardness >= 0.99) { x.fillStyle = col; x.beginPath(); x.arc(64, 64, 63, 0, Math.PI * 2); x.fill(); }
      else { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, col); g.addColorStop(Math.max(0.01, hardness * 0.95), col); g.addColorStop(1, col0); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
    } else {
      x.fillStyle = col; x.translate(64, 64); x.beginPath();
      if (tip === 'star' || tip === 'sparkle') { const inner = tip === 'star' ? 0.42 : 0.16; for (let i = 0; i < 8; i++) { const r = i % 2 ? 62 * inner : 62, a = i * Math.PI / 4 - Math.PI / 2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); }
      else if (tip === 'moon') { x.arc(0, 0, 60, 0, Math.PI * 2); x.fill(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(26, -14, 52, 0, Math.PI * 2); x.fill(); }
      else if (tip === 'heart') { x.moveTo(0, 52); x.bezierCurveTo(-70, -10, -40, -70, 0, -30); x.bezierCurveTo(40, -70, 70, -10, 0, 52); x.fill(); }
      if (hardness < 0.99) { // 柔化：疊一層模糊版
        const b = U.mkCanvas(128, 128), bx = b.getContext('2d'); bx.filter = `blur(${(1 - hardness) * 10}px)`; bx.drawImage(c, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'copy'; x.drawImage(b, 0, 0);
      }
    }
    this.cache.set(key, c); return c;
  },
};
Brush.init();

// ---------------- 網點（screentone）----------------
// 點陣固定在畫布座標上，所以不管用筆刷鋪幾次都接得起來。density 0..1 = 點有多大（1 = 全黑）
const Tone = Studio.tone = {
  defaults: { pitch: 8, density: 0.45, angle: 45, shape: 'dot' },
  // 在 ctx 上畫網點；densityAt(x,y) 回傳 0..1，bounds 限制範圍（畫布座標）
  render(ctx, o, rgb, densityAt, bounds){
    const pitch = Math.max(2, o.pitch), a = (o.angle || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const W = bounds.x + bounds.w, H = bounds.y + bounds.h;
    ctx.save(); ctx.fillStyle = U.rgba(rgb, 1); ctx.strokeStyle = ctx.fillStyle; ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h); ctx.clip();
    // 用旋轉後的格子座標 (u,v) 掃描，涵蓋整個 bounds
    const corners = [[bounds.x, bounds.y], [W, bounds.y], [bounds.x, H], [W, H]].map(([x, y]) => [x * c + y * s, -x * s + y * c]);
    const u0 = Math.floor(Math.min(...corners.map(p => p[0])) / pitch) - 1, u1 = Math.ceil(Math.max(...corners.map(p => p[0])) / pitch) + 1, v0 = Math.floor(Math.min(...corners.map(p => p[1])) / pitch) - 1, v1 = Math.ceil(Math.max(...corners.map(p => p[1])) / pitch) + 1;
    if (o.shape === 'line' || o.shape === 'cross') {
      for (let pass = 0; pass < (o.shape === 'cross' ? 2 : 1); pass++) { const ang = a + pass * Math.PI / 2, cc = Math.cos(ang), ss = Math.sin(ang);
        for (let vi = v0; vi <= v1; vi++) { const v = vi * pitch; // 一條線：沿 u 方向採樣密度分段畫
          let prev = null; for (let ui = u0; ui <= u1; ui++) { const u = ui * pitch; const x = u * cc - v * ss, y = u * ss + v * cc; const d = U.clamp(densityAt(x, y), 0, 1); const w = pitch * d; if (prev && w > 0.2) { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(x, y); ctx.stroke(); } prev = [x, y]; } } }
      ctx.restore(); return; }
    ctx.beginPath();
    for (let vi = v0; vi <= v1; vi++) for (let ui = u0; ui <= u1; ui++) { const u = ui * pitch, v = vi * pitch; const x = u * c - v * s, y = u * s + v * c; if (x < bounds.x - pitch || x > W + pitch || y < bounds.y - pitch || y > H + pitch) continue;
      const d = U.clamp(densityAt(x, y), 0, 1); if (d <= 0.01) continue; const r = pitch * 0.5 * Math.sqrt(d) * 1.08;
      if (o.shape === 'square') { const h = r * 0.9; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.rect(-h, -h, h * 2, h * 2); ctx.restore(); } else { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); } }
    ctx.fill(); ctx.restore();
  },
  // 用某張圖的明暗當密度（暗＝密）
  lumField(canvas){ const w = canvas.width, h = canvas.height, d = canvas.getContext('2d').getImageData(0, 0, w, h).data; return (x, y) => { const xi = x | 0, yi = y | 0; if (xi < 0 || yi < 0 || xi >= w || yi >= h) return 0; const i = (yi * w + xi) * 4; const a = d[i + 3] / 255; const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; return (1 - lum) * a; }; },
};

// ---------------- 一筆（paint / erase）----------------
class Stroke {
  constructor(mode, canvas, settings, rgb){ this.mode = mode; this.s = settings || Brush.s; this.canvas = canvas || App.strokeCanvas; this.ctx = this.canvas.getContext('2d'); this._rgb = rgb; this._sym = !canvas && App.doc && App.doc.symmetry; this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.last = null; this.sm = null; this.acc = 0; this.bbox = null; this.n = 0; this.rgb = this._rgb || App.rgb(); if (!canvas && App.sel) { this.clip = App.sel.path; } }
  // 抖動修正三段：過濾（太小的移動不理）→ StreamLine（拉繩：筆跡被繩子拖著走）→ 平滑（移動平均）
  add(p, pr, flush){
    const s = this.s; const st = flush ? 0 : (s.streamline || 0), filt = s.filter || 0, smooth = s.smooth || 0;
    if (!flush && this.raw && filt > 0) { const th = filt * filt * 6 / Math.max(0.3, App.view ? App.view.s : 1); if (U.dist(this.raw, p) < th) return; }
    this.raw = { x: p.x, y: p.y };
    let sp;
    if (!this.sm) sp = { x: p.x, y: p.y };
    else { const rope = st * st * 48; const dx = p.x - this.sm.x, dy = p.y - this.sm.y, d = Math.hypot(dx, dy); const k = d > rope ? (d - rope) / d : 0; sp = { x: this.sm.x + dx * k, y: this.sm.y + dy * k }; sp = { x: U.lerp(this.sm.x, sp.x, 1 - st * 0.85), y: U.lerp(this.sm.y, sp.y, 1 - st * 0.85) }; }
    this.sm = sp;
    if (smooth > 0) { const n = 1 + Math.round(smooth * 14); this.hist = this.hist || []; this.hist.push(sp); if (this.hist.length > n) this.hist.shift(); let ax = 0, ay = 0; for (const q of this.hist) { ax += q.x; ay += q.y; } sp = { x: ax / this.hist.length, y: ay / this.hist.length }; }
    sp = { x: sp.x, y: sp.y, pr };
    if (!this.last) { this.stamp(sp.x, sp.y, pr); this.last = sp; return; }
    const sz = this.sizeAt(pr), spacing = Math.max(0.8, sz * s.spacing);
    const d = U.dist(this.last, sp); if (d < 0.01) return;
    let t = this.acc; const dx = (sp.x - this.last.x) / d, dy = (sp.y - this.last.y) / d;
    while (t <= d) { const k = t / d; this.stamp(this.last.x + dx * t, this.last.y + dy * t, U.lerp(this.last.pr, pr, k)); t += spacing; }
    this.acc = t - d; this.last = sp;
  }
  // 收尾：把被繩子／平均拖住的尾巴補畫到筆離開的位置
  finish(pr){ if (!this.raw) return; const end = this.raw; for (let i = 0; i < 12; i++) { this.add(end, pr == null ? (this.last ? this.last.pr : 1) : pr, true); if (this.last && U.dist(this.last, end) < 0.5) break; } }
  sizeAt(pr){ const s = this.s; return s.size * (s.pSize ? (0.12 + 0.88 * pr) : 1); }
  stamp(x, y, pr){
    const s = this.s, ctx = this.ctx; const sz = this.sizeAt(pr); const alpha = (s.pOp ? Math.pow(pr, 1.2) : 1) * (s.hardness < 0.99 && s.tip === 'circle' ? 0.55 : 1);
    const dab = Brush.dab(s.tip, s.hardness, this.rgb);
    const n = Math.max(1, s.count | 0);
    for (let i = 0; i < n; i++) {
      let px = x, py = y, dsz = sz;
      if (s.scatter > 0 || n > 1) { const a = Math.random() * Math.PI * 2, r = Math.random() * s.scatter / 100 * sz; px += Math.cos(a) * r; py += Math.sin(a) * r; dsz = sz * (n > 1 ? (0.25 + 0.75 * Math.random()) : 1); }
      this.put(ctx, dab, px, py, dsz, alpha);
      if (this._sym) this.put(ctx, dab, App.doc.w - px, py, dsz, alpha);
    }
    this.n++;
    const r = sz * (1 + s.scatter / 100) + 2; this.grow(x - r, y - r, r * 2, r * 2); if (this._sym) this.grow(App.doc.w - x - r, y - r, r * 2, r * 2);
  }
  put(ctx, dab, x, y, sz, alpha){ ctx.save(); if (this.clip) ctx.clip(this.clip); ctx.globalAlpha = alpha; const tip = this.s.tip; if (tip !== 'circle') { ctx.translate(x, y); ctx.rotate(this.n * 0.7); ctx.drawImage(dab, -sz / 2, -sz / 2, sz, sz); } else ctx.drawImage(dab, x - sz / 2, y - sz / 2, sz, sz); ctx.restore(); }
  grow(x, y, w, h){ if (!this.bbox) this.bbox = { x, y, w, h }; else { const b = this.bbox, x1 = Math.max(b.x + b.w, x + w), y1 = Math.max(b.y + b.h, y + h); b.x = Math.min(b.x, x); b.y = Math.min(b.y, y); b.w = x1 - b.x; b.h = y1 - b.y; } }
  // 把這一筆套到目標畫布（預覽與提交共用）
  applyTo(target, layer){
    const x = target.getContext('2d'); x.save(); x.globalAlpha = this.s.opacity;
    if (this.mode === 'erase') x.globalCompositeOperation = layer.alphaLock ? 'source-over' : 'destination-out';
    else x.globalCompositeOperation = layer.alphaLock ? 'source-atop' : 'source-over';
    if (this.mode === 'erase' && layer.alphaLock) { // 鎖定透明度時橡皮擦 = 塗背景色（次要色）
      const t = Comp.tmp(target.width, target.height), tx = t.getContext('2d'); tx.drawImage(this.canvas, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = App.hex2(); tx.fillRect(0, 0, t.width, t.height); x.globalCompositeOperation = 'source-atop'; x.drawImage(t, 0, 0); Comp.free(t);
    } else if (this.mode === 'paint' && this.s.tone && this.bbox) { // 網點筆刷：筆跡當遮罩，裡面鋪固定座標的點陣
      const t = Comp.tmp(target.width, target.height), tx = t.getContext('2d'); const o = this.s.tone; const dens = o.density; Tone.render(tx, o, this.rgb, () => dens, { x: Math.max(0, this.bbox.x), y: Math.max(0, this.bbox.y), w: Math.min(target.width, this.bbox.x + this.bbox.w) - Math.max(0, this.bbox.x), h: Math.min(target.height, this.bbox.y + this.bbox.h) - Math.max(0, this.bbox.y) });
      tx.globalCompositeOperation = 'destination-in'; tx.drawImage(this.canvas, 0, 0); x.drawImage(t, 0, 0); Comp.free(t);
    } else x.drawImage(this.canvas, 0, 0);
    x.restore();
  }
}
Studio.Stroke = Stroke;

// ---------------- 工具 ----------------
const Tools = Studio.tools = {};
const needLayer = () => { const l = App.doc.active; if (!l) { App.toast('沒有圖層'); return null; } if (l.locked) { App.toast('圖層已鎖定'); return null; } return l; };

function paintTool(mode){
  return {
    stroke: null, snap: null, layer: null,
    down(p, pr){ const l = needLayer(); if (!l) return; this.layer = l; this.stroke = new Stroke(mode); this.stroke.add(p, pr); App.preview = (cv) => { const t = Comp.tmp(cv.width, cv.height); t.getContext('2d').drawImage(cv, 0, 0); this.stroke.applyTo(t, l); return t; }; App.invalidate(); },
    move(p, pr){ if (!this.stroke) return; this.stroke.add(p, pr); App.invalidate(); },
    up(p, pr){ if (!this.stroke) return; this.stroke.finish(pr); const l = this.layer, cv = l.canvas(App.doc.frame); const snap = App.history.beginPixels(cv); this.stroke.applyTo(cv, l); App.history.commitPixels(snap, this.stroke.bbox, l); l.thumbDirty = true; this.stroke = null; App.preview = null; App.invalidate(); App.dirty(); },
    cancel(){ this.stroke = null; App.preview = null; App.invalidate(); },
  };
}
Tools.brush = paintTool('paint'); Tools.soft = paintTool('paint'); Tools.dots = paintTool('paint'); Tools.eraser = paintTool('erase');

// 塗抹：拎著一小塊畫面往前帶
Tools.smudge = {
  patch: null, snap: null, layer: null, last: null, bbox: null,
  down(p, pr){ const l = needLayer(); if (!l) return; this.layer = l; const cv = l.canvas(App.doc.frame); this.snap = App.history.beginPixels(cv); this.last = p; this.bbox = null; this.grab(cv, p); },
  grab(cv, p){ const sz = Math.max(4, Brush.s.size | 0); const c = U.mkCanvas(sz, sz), x = c.getContext('2d'); x.drawImage(cv, p.x - sz / 2, p.y - sz / 2, sz, sz, 0, 0, sz, sz); x.globalCompositeOperation = 'destination-in'; x.drawImage(Brush.dab('circle', Brush.s.hardness, [0, 0, 0]), 0, 0, sz, sz); this.patch = c; },
  move(p){ if (!this.patch) return; const cv = this.layer.canvas(App.doc.frame), x = cv.getContext('2d'); const sz = this.patch.width, sp = Math.max(1, sz * Brush.s.spacing); const d = U.dist(this.last, p); const steps = Math.max(1, Math.floor(d / sp));
    for (let i = 1; i <= steps; i++) { const q = { x: U.lerp(this.last.x, p.x, i / steps), y: U.lerp(this.last.y, p.y, i / steps) }; x.save(); if (App.sel) x.clip(App.sel.path); x.globalAlpha = Brush.s.opacity; if (this.layer.alphaLock) x.globalCompositeOperation = 'source-atop'; x.drawImage(this.patch, q.x - sz / 2, q.y - sz / 2); x.restore(); this.grab(cv, q); const b = { x: q.x - sz, y: q.y - sz, w: sz * 2, h: sz * 2 }; this.bbox = this.bbox ? unionBox(this.bbox, b) : b; }
    this.last = p; this.layer.thumbDirty = true; App.invalidate(); },
  up(){ if (!this.patch) return; App.history.commitPixels(this.snap, this.bbox, this.layer); this.patch = null; App.dirty(); },
  cancel(){ this.patch = null; },
};
function unionBox(a, b){ const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; }

// 填色（油漆桶）
Tools.fill = {
  opts: { tol: 24, grow: 1, all: false },
  down(p){ const l = needLayer(); if (!l) return; const d = App.doc, w = d.w, h = d.h; const x0 = p.x | 0, y0 = p.y | 0; if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return;
    const srcCanvas = this.opts.all ? Comp.render(d, Comp.tmp(w, h)) : l.canvas(d.frame); const img = srcCanvas.getContext('2d').getImageData(0, 0, w, h).data; if (this.opts.all) Comp.free(srcCanvas);
    const mask = new Uint8Array(w * h); const i0 = (y0 * w + x0) * 4; const sr = img[i0], sg = img[i0 + 1], sb = img[i0 + 2], sa = img[i0 + 3]; const tol = this.opts.tol * 2.55;
    const ok = (i) => { const j = i * 4; const a = img[j + 3]; if (sa === 0 && a === 0) return true; return Math.abs(img[j] - sr) <= tol && Math.abs(img[j + 1] - sg) <= tol && Math.abs(img[j + 2] - sb) <= tol && Math.abs(a - sa) <= tol; };
    const stack = [y0 * w + x0]; let minx = w, miny = h, maxx = 0, maxy = 0;
    while (stack.length) { let i = stack.pop(); if (mask[i] || !ok(i)) continue; let xl = i % w, y = (i / w) | 0; let xs = xl; while (xs > 0 && !mask[i - (xl - xs) - 1] && ok(i - (xl - xs) - 1)) xs--; let xe = xl; while (xe < w - 1 && !mask[i + (xe - xl) + 1] && ok(i + (xe - xl) + 1)) xe++;
      for (let x = xs; x <= xe; x++) { const k = y * w + x; mask[k] = 1; if (y > 0 && !mask[k - w]) stack.push(k - w); if (y < h - 1 && !mask[k + w]) stack.push(k + w); }
      if (xs < minx) minx = xs; if (xe > maxx) maxx = xe; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    // 擴張 n px，避免色線邊緣留縫
    let m = mask; for (let g = 0; g < this.opts.grow; g++) { const m2 = new Uint8Array(m); for (let y = Math.max(1, miny - g - 1); y < Math.min(h - 1, maxy + g + 2); y++) for (let x = Math.max(1, minx - g - 1); x < Math.min(w - 1, maxx + g + 2); x++) { const k = y * w + x; if (!m[k] && (m[k - 1] || m[k + 1] || m[k - w] || m[k + w])) m2[k] = 1; } m = m2; }
    const rgb = App.rgb(); const out = new ImageData(w, h); const od = out.data; for (let k = 0; k < w * h; k++) if (m[k]) { od[k * 4] = rgb[0]; od[k * 4 + 1] = rgb[1]; od[k * 4 + 2] = rgb[2]; od[k * 4 + 3] = 255; }
    const t = Comp.tmp(w, h); t.getContext('2d').putImageData(out, 0, 0);
    const cv = l.canvas(d.frame), cx = cv.getContext('2d'); const snap = App.history.beginPixels(cv); cx.save(); if (App.sel) cx.clip(App.sel.path); cx.globalAlpha = Brush.s.opacity; cx.globalCompositeOperation = l.alphaLock ? 'source-atop' : 'source-over'; cx.drawImage(t, 0, 0); cx.restore(); Comp.free(t);
    const gg = this.opts.grow + 1; App.history.commitPixels(snap, { x: minx - gg, y: miny - gg, w: maxx - minx + gg * 2, h: maxy - miny + gg * 2 }, l); l.thumbDirty = true; App.invalidate(); App.dirty(); },
  move(){}, up(){}, cancel(){},
};

// 漸層：拖一條線
Tools.gradient = {
  opts: { type: 'linear', to: 'secondary' }, a: null, b: null, layer: null,
  down(p){ const l = needLayer(); if (!l) return; this.layer = l; this.a = p; this.b = p; App.preview = (cv) => { const t = Comp.tmp(cv.width, cv.height); t.getContext('2d').drawImage(cv, 0, 0); this.apply(t, l); return t; }; },
  move(p){ if (!this.a) return; this.b = p; App.invalidate(); },
  up(){ if (!this.a) return; const l = this.layer, cv = l.canvas(App.doc.frame); if (U.dist(this.a, this.b) > 2) { const snap = App.history.beginPixels(cv); this.apply(cv, l); App.history.commitPixels(snap, null, l); l.thumbDirty = true; App.dirty(); } this.a = this.b = null; App.preview = null; App.invalidate(); },
  cancel(){ this.a = null; App.preview = null; },
  apply(target, layer){ const x = target.getContext('2d'); const a = this.a, b = this.b; const c1 = App.rgb(), c2 = this.opts.to === 'secondary' ? App.rgb2() : c1; const a2 = this.opts.to === 'secondary' ? 1 : 0;
    let g; if (this.opts.type === 'linear') g = x.createLinearGradient(a.x, a.y, b.x, b.y); else g = x.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.max(1, U.dist(a, b)));
    g.addColorStop(0, U.rgba(c1, 1)); g.addColorStop(1, U.rgba(c2, a2));
    x.save(); if (App.sel) x.clip(App.sel.path); x.globalAlpha = Brush.s.opacity; x.globalCompositeOperation = layer.alphaLock ? 'source-atop' : 'source-over'; x.fillStyle = g; x.fillRect(0, 0, target.width, target.height); x.restore(); },
  overlay(ctx){ if (!this.a) return; const s = App.view.s; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / s; ctx.setLineDash([6 / s, 4 / s]); ctx.beginPath(); ctx.moveTo(this.a.x, this.a.y); ctx.lineTo(this.b.x, this.b.y); ctx.stroke(); ctx.setLineDash([]); for (const q of [this.a, this.b]) { ctx.beginPath(); ctx.arc(q.x, q.y, 5 / s, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); } },
};

// 網點填滿：均勻／依底圖明暗（半色調）／拖一條線做漸層網點
Tools.tone = {
  opts: { pitch: 8, density: 0.45, angle: 45, shape: 'dot', src: 'flat', d0: 0.1, d1: 0.9 }, a: null, b: null, layer: null, field: null,
  activate(){ const l = needLayer(); if (!l) return false; this.layer = l; this.a = this.b = null; this.field = null; this.refreshField(); App.preview = (cv) => { const t = Comp.tmp(cv.width, cv.height); t.getContext('2d').drawImage(cv, 0, 0); this.apply(t, l); return t; }; App.invalidate(); return true; },
  refreshField(){ const d = App.doc; if (this.opts.src === 'image') { const c = Comp.render(d, Comp.tmp(d.w, d.h)); this.field = Tone.lumField(c); Comp.free(c); } else this.field = null; App.invalidate(); },
  down(p){ if (!this.layer) { if (!this.activate()) return; } if (this.opts.src === 'gradient') { this.a = p; this.b = p; App.invalidate(); } },
  move(p){ if (this.a) { this.b = p; App.invalidate(); } },
  up(){},
  cancel(){},
  densityFn(){ const o = this.opts; if (o.src === 'image' && this.field) return this.field; if (o.src === 'gradient' && this.a && this.b) { const ax = this.a.x, ay = this.a.y, dx = this.b.x - ax, dy = this.b.y - ay, L2 = dx * dx + dy * dy || 1; return (x, y) => { const t = U.clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1); return U.lerp(o.d0, o.d1, t); }; } const dd = o.density; return () => dd; },
  apply(target, layer){ const d = App.doc; const x = target.getContext('2d'); x.save(); if (App.sel) x.clip(App.sel.path); x.globalAlpha = Brush.s.opacity; x.globalCompositeOperation = layer.alphaLock ? 'source-atop' : 'source-over'; const b = App.sel ? App.sel.bbox : { x: 0, y: 0, w: d.w, h: d.h }; Tone.render(x, this.opts, App.rgb(), this.densityFn(), b); x.restore(); },
  commit(){ const l = this.layer; if (!l) return; const cv = l.canvas(App.doc.frame); const snap = App.history.beginPixels(cv); this.apply(cv, l); App.history.commitPixels(snap, App.sel ? App.sel.bbox : null, l); l.thumbDirty = true; this.leave(); App.dirty(); App.toast('網點已填入'); },
  leave(){ this.layer = null; this.a = this.b = null; App.preview = null; App.invalidate(); },
  overlay(ctx){ if (!this.a || !this.b) return; const s = App.view.s; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / s; ctx.setLineDash([6 / s, 4 / s]); ctx.beginPath(); ctx.moveTo(this.a.x, this.a.y); ctx.lineTo(this.b.x, this.b.y); ctx.stroke(); ctx.setLineDash([]); for (const q of [this.a, this.b]) { ctx.beginPath(); ctx.arc(q.x, q.y, 5 / s, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); } },
};

// 吸色：從合成結果取色
Tools.picker = {
  down(p){ this.pick(p); }, move(p){ this.pick(p); }, up(){ if (App.pickerReturn) { const t = App.pickerReturn; App.pickerReturn = null; App.setTool(t); } }, cancel(){},
  pick(p){ const d = App.doc; const x = p.x | 0, y = p.y | 0; if (x < 0 || y < 0 || x >= d.w || y >= d.h) return; const c = Comp.render(d, Comp.tmp(d.w, d.h)); const px = c.getContext('2d').getImageData(x, y, 1, 1).data; Comp.free(c); if (px[3] > 0) App.setRGB([px[0], px[1], px[2]]); },
};

// 選取：矩形／套索
function selTool(kind){
  return {
    pts: null, start: null,
    down(p){ this.start = p; this.pts = [p]; App.invalidate(); },
    move(p){ if (!this.pts) return; if (kind === 'rect') this.pts = [this.start, { x: p.x, y: this.start.y }, p, { x: this.start.x, y: p.y }]; else this.pts.push(p); App.invalidate(); },
    up(p){ if (!this.pts) return; const pts = this.pts; this.pts = null; const path = new Path2D(); pts.forEach((q, i) => i ? path.lineTo(q.x, q.y) : path.moveTo(q.x, q.y)); path.closePath();
      let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9; for (const q of pts) { minx = Math.min(minx, q.x); miny = Math.min(miny, q.y); maxx = Math.max(maxx, q.x); maxy = Math.max(maxy, q.y); }
      if (maxx - minx < 3 || maxy - miny < 3) { App.sel = null; App.toast('取消選取'); } else App.sel = { path, bbox: { x: minx, y: miny, w: maxx - minx, h: maxy - miny } };
      App.invalidate(); },
    cancel(){ this.pts = null; },
    overlay(ctx){ if (!this.pts || this.pts.length < 2) return; const s = App.view.s; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1 / s; ctx.setLineDash([5 / s, 4 / s]); ctx.beginPath(); this.pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); },
  };
}
Tools.select = selTool('rect'); Tools.lasso = selTool('lasso');

// 移動／變形：把圖層（或選取範圍）浮起來，拖、縮放、旋轉，然後套用
Tools.move = {
  fl: null, drag: null,
  activate(){ const l = App.doc.active; if (!l || l.locked) { this.fl = null; return; } const d = App.doc, cv = l.canvas(d.frame);
    const src = U.mkCanvas(d.w, d.h), sx = src.getContext('2d'); sx.save(); if (App.sel) sx.clip(App.sel.path); sx.drawImage(cv, 0, 0); sx.restore();
    const bb = App.sel ? App.sel.bbox : U.alphaBounds(src); if (!bb) { this.fl = null; App.toast('這個圖層是空的'); return; }
    this.snap = App.history.beginPixels(cv); const x = cv.getContext('2d'); x.save(); if (App.sel) { x.clip(App.sel.path); x.clearRect(0, 0, d.w, d.h); } else x.clearRect(0, 0, d.w, d.h); x.restore();
    this.fl = { src, bb, cx: bb.x + bb.w / 2, cy: bb.y + bb.h / 2, x: 0, y: 0, sx: 1, sy: 1, rot: 0, layer: l, frame: d.frame }; l.thumbDirty = true;
    App.preview = (cvs) => { const t = Comp.tmp(cvs.width, cvs.height); const tx = t.getContext('2d'); tx.drawImage(cvs, 0, 0); this.drawFloating(tx); return t; }; App.invalidate(); },
  matrix(){ const f = this.fl; return new DOMMatrix().translate(f.cx + f.x, f.cy + f.y).rotate(f.rot * 180 / Math.PI).scale(f.sx, f.sy).translate(-f.cx, -f.cy); },
  drawFloating(ctx){ const f = this.fl; ctx.save(); const m = this.matrix(); ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f); ctx.drawImage(f.src, 0, 0); ctx.restore(); },
  corners(){ const f = this.fl, m = this.matrix(), b = f.bb; return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => { const p = m.transformPoint(new DOMPoint(x, y)); return { x: p.x, y: p.y }; }); },
  handles(){ const c = this.corners(); const top = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 }; const cen = { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 }; const dx = top.x - cen.x, dy = top.y - cen.y, L = Math.hypot(dx, dy) || 1; const rotH = { x: top.x + dx / L * 40 / App.view.s, y: top.y + dy / L * 40 / App.view.s }; return { c, rotH, cen }; },
  down(p){ if (!this.fl) { this.activate(); if (!this.fl) return; } const h = this.handles(), r = 14 / App.view.s; const f = this.fl;
    if (U.dist(p, h.rotH) < r) this.drag = { k: 'rot', a0: Math.atan2(p.y - h.cen.y, p.x - h.cen.x), r0: f.rot };
    else { let ci = h.c.findIndex(q => U.dist(p, q) < r); if (ci >= 0) this.drag = { k: 'scale', d0: U.dist(p, h.cen), sx0: f.sx, sy0: f.sy }; else this.drag = { k: 'move', p0: p, x0: f.x, y0: f.y }; } },
  move(p){ const g = this.drag, f = this.fl; if (!g || !f) return;
    if (g.k === 'move') { f.x = g.x0 + p.x - g.p0.x; f.y = g.y0 + p.y - g.p0.y; }
    else if (g.k === 'rot') { const h = this.handles(); f.rot = g.r0 + Math.atan2(p.y - h.cen.y, p.x - h.cen.x) - g.a0; }
    else if (g.k === 'scale') { const h = this.handles(); const k = Math.max(0.02, U.dist(p, h.cen) / g.d0); f.sx = g.sx0 * k; f.sy = g.sy0 * k; }
    App.invalidate(); },
  up(){ this.drag = null; },
  cancel(){ this.drag = null; },
  flip(h){ if (!this.fl) this.activate(); if (!this.fl) return; if (h) this.fl.sx *= -1; else this.fl.sy *= -1; App.invalidate(); },
  nudge(dx, dy){ if (!this.fl) return; this.fl.x += dx; this.fl.y += dy; App.invalidate(); },
  apply(){ const f = this.fl; if (!f) return; const cv = f.layer.cels[f.layer.celIndex(f.frame)]; const x = cv.getContext('2d'); x.save(); this.drawFloating(x); x.restore(); App.history.commitPixels(this.snap, null, f.layer); f.layer.thumbDirty = true; this.fl = null; App.preview = null; App.sel = null; App.invalidate(); App.dirty(); },
  discard(){ const f = this.fl; if (!f) return; const cv = f.layer.cels[f.layer.celIndex(f.frame)]; cv.getContext('2d').drawImage(this.snap.before, 0, 0); f.layer.thumbDirty = true; this.fl = null; App.preview = null; App.invalidate(); },
  overlay(ctx){ if (!this.fl) return; const h = this.handles(), s = App.view.s; ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 1.5 / s; ctx.beginPath(); h.c.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo((h.c[0].x + h.c[1].x) / 2, (h.c[0].y + h.c[1].y) / 2); ctx.lineTo(h.rotH.x, h.rotH.y); ctx.stroke();
    ctx.fillStyle = '#fff'; for (const q of h.c) { ctx.beginPath(); ctx.arc(q.x, q.y, 7 / s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(h.rotH.x, h.rotH.y, 8 / s, 0, Math.PI * 2); ctx.fill(); },
};

Tools.hand = { down(p, pr, ev){ this.p0 = { x: ev.clientX, y: ev.clientY }; this.v0 = { x: App.view.x, y: App.view.y }; }, move(p, pr, ev){ if (!this.p0) return; App.view.x = this.v0.x + (ev.clientX - this.p0.x); App.view.y = this.v0.y + (ev.clientY - this.p0.y); App.invalidate(); }, up(){ this.p0 = null; }, cancel(){ this.p0 = null; } };
})();
