'use strict';
// ======================================================================
//  夢境畫室 core：資料模型（文件／圖層／畫格／零件）、歷史、合成、儲存
// ======================================================================
const Studio = window.Studio = {};

const U = Studio.util = {
  uid(){ return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); },
  clamp(v, a, b){ return v < a ? a : v > b ? b : v; },
  lerp(a, b, t){ return a + (b - a) * t; },
  mkCanvas(w, h){ const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; },
  cloneCanvas(src){ const c = U.mkCanvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; },
  dist(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); },
  hsv2rgb(h, s, v){
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const r = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return [Math.round(r[0] * 255), Math.round(r[1] * 255), Math.round(r[2] * 255)];
  },
  rgb2hsv(r, g, b){
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; if (h < 0) h += 1; }
    return [h, mx ? d / mx : 0, mx];
  },
  hex(r, g, b){ return '#' + [r, g, b].map(v => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); },
  parseHex(s){ const m = /^#?([0-9a-f]{6})$/i.exec(s.trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; },
  rgba(rgb, a){ return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; },
  // 圖像的不透明範圍
  alphaBounds(canvas){
    const w = canvas.width, h = canvas.height, d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  },
  download(name, blob){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); },
  toBlob(canvas){ return new Promise(r => canvas.toBlob(r, 'image/png')); },
  loadImage(src){ return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); },
  blobToDataURL(b){ return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); },
};

// ---------------- 圖層 ----------------
class Layer {
  constructor(doc, name){
    this.id = U.uid(); this.doc = doc; this.name = name || '圖層';
    this.visible = true; this.opacity = 1; this.blend = 'source-over'; this.clip = false; this.alphaLock = false; this.locked = false;
    this.animated = false;
    this.cels = { 0: U.mkCanvas(doc.w, doc.h) };   // frame -> canvas（動畫圖層才會有多個）
    this.part = { pivot: null, parent: null, grid: 0, lattice: null, base: Layer.zeroPose(), keys: {} }; // 骨架資料
    this.thumbDirty = true; this.thumb = null;
  }
  static zeroPose(){ return { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, lat: null }; }
  celIndex(frame){ if (!this.animated) return 0; let f = frame; while (f > 0 && !this.cels[f]) f--; return this.cels[f] ? f : 0; }
  hasCel(frame){ return this.animated ? !!this.cels[frame] : frame === 0; }
  canvas(frame){ const i = this.celIndex(frame || 0); if (!this.cels[i]) this.cels[i] = U.mkCanvas(this.doc.w, this.doc.h); return this.cels[i]; }
  ctx(frame){ return this.canvas(frame).getContext('2d'); }
  resizeAll(w, h, ox, oy){ for (const k in this.cels) { const c = U.mkCanvas(w, h); c.getContext('2d').drawImage(this.cels[k], ox, oy); this.cels[k] = c; } this.thumbDirty = true; }
}
Studio.Layer = Layer;

// ---------------- 文件 ----------------
class Doc {
  constructor(w, h, name){
    this.id = U.uid(); this.w = w; this.h = h; this.name = name || '未命名';
    this.layers = []; this.activeId = null;
    this.frame = 0; this.frames = 1; this.fps = 8; this.onion = false;
    this.params = Doc.defaultParams();
    this.anim = { duration: 3, tracks: {} }; // 參數時間軸 tracks[paramId] = [{t, v}]
    this.symmetry = false;
  }
  // 預設參數：名稱與 ID 對齊 Live2D Cubism 的標準參數（l2d = Cubism 的參數 ID，range = Cubism 的數值範圍；本程式內部一律 -1~1 或 0~1）
  static PARAM_PRESETS(){
    return [
      { id: 'angX', name: '角度X', min: -1, max: 1, l2d: 'ParamAngleX', range: [-30, 30], lab: ['看左', '看右'] },
      { id: 'angY', name: '角度Y', min: -1, max: 1, l2d: 'ParamAngleY', range: [-30, 30], lab: ['低頭', '抬頭'] },
      { id: 'angZ', name: '角度Z', min: -1, max: 1, l2d: 'ParamAngleZ', range: [-30, 30], lab: ['左歪頭', '右歪頭'] },
      { id: 'eyeL', name: '左眼 開閉', min: 0, max: 1, l2d: 'ParamEyeLOpen', range: [0, 1], lab: ['', '閉眼'], invert: true },
      { id: 'eyeR', name: '右眼 開閉', min: 0, max: 1, l2d: 'ParamEyeROpen', range: [0, 1], lab: ['', '閉眼'], invert: true },
      { id: 'blink', name: '眼睛 開閉', min: 0, max: 1, l2d: 'ParamEyeLOpen+ParamEyeROpen', range: [0, 1], lab: ['', '閉眼'], invert: true },
      { id: 'eyeBallX', name: '眼珠X', min: -1, max: 1, l2d: 'ParamEyeBallX', range: [-1, 1], lab: ['看左', '看右'] },
      { id: 'eyeBallY', name: '眼珠Y', min: -1, max: 1, l2d: 'ParamEyeBallY', range: [-1, 1], lab: ['往下', '往上'] },
      { id: 'browLY', name: '左眉 上下', min: -1, max: 1, l2d: 'ParamBrowLY', range: [-1, 1], lab: ['往下', '往上'] },
      { id: 'browRY', name: '右眉 上下', min: -1, max: 1, l2d: 'ParamBrowRY', range: [-1, 1], lab: ['往下', '往上'] },
      { id: 'mouth', name: '嘴 開閉', min: 0, max: 1, l2d: 'ParamMouthOpenY', range: [0, 1], lab: ['', '張嘴'] },
      { id: 'mouthForm', name: '嘴 變形', min: -1, max: 1, l2d: 'ParamMouthForm', range: [-1, 1], lab: ['嘟嘴', '微笑'] },
      { id: 'cheek', name: '臉頰', min: 0, max: 1, l2d: 'ParamCheek', range: [0, 1], lab: ['', '臉紅'] },
      { id: 'bodyX', name: '身體旋轉X', min: -1, max: 1, l2d: 'ParamBodyAngleX', range: [-10, 10], lab: ['往左', '往右'] },
      { id: 'bodyY', name: '身體旋轉Y', min: -1, max: 1, l2d: 'ParamBodyAngleY', range: [-10, 10], lab: ['縮', '伸'] },
      { id: 'bodyZ', name: '身體旋轉Z', min: -1, max: 1, l2d: 'ParamBodyAngleZ', range: [-10, 10], lab: ['左傾', '右傾'] },
      { id: 'breath', name: '呼吸', min: 0, max: 1, l2d: 'ParamBreath', range: [0, 1], lab: ['', '吸氣'] },
      { id: 'hairFront', name: '頭髮搖擺 前', min: -1, max: 1, l2d: 'ParamHairFront', range: [-1, 1], lab: ['往左', '往右'] },
      { id: 'hairSide', name: '頭髮搖擺 側', min: -1, max: 1, l2d: 'ParamHairSide', range: [-1, 1], lab: ['往左', '往右'] },
      { id: 'hairBack', name: '頭髮搖擺 後', min: -1, max: 1, l2d: 'ParamHairBack', range: [-1, 1], lab: ['往左', '往右'] },
      { id: 'armL', name: '左手臂', min: -1, max: 1, l2d: 'ParamArmLA', range: [-10, 10], lab: ['放下', '抬起'] },
      { id: 'armR', name: '右手臂', min: -1, max: 1, l2d: 'ParamArmRA', range: [-10, 10], lab: ['放下', '抬起'] },
    ];
  }
  static defaultParams(){ const want = ['angX', 'angY', 'angZ', 'bodyX', 'breath', 'blink', 'mouth']; return Doc.PARAM_PRESETS().filter(p => want.includes(p.id)).map(p => Object.assign({ v: 0 }, p)); }
  get active(){ return this.layers.find(l => l.id === this.activeId) || null; }
  layerIndex(l){ return this.layers.indexOf(l); }
  addLayer(name, at){ const l = new Layer(this, name); const i = at == null ? (this.active ? this.layerIndex(this.active) + 1 : this.layers.length) : at; this.layers.splice(i, 0, l); this.activeId = l.id; return l; }
  removeLayer(l){ const i = this.layerIndex(l); if (i < 0) return; this.layers.splice(i, 1); if (this.activeId === l.id) this.activeId = (this.layers[Math.min(i, this.layers.length - 1)] || {}).id || null; }
  // 剪裁群組：回傳 [{base, clips:[...]}]
  groups(){
    const out = []; let cur = null;
    for (const l of this.layers) { if (l.clip && cur) cur.clips.push(l); else { cur = { base: l, clips: [] }; out.push(cur); } }
    return out;
  }
  baseOf(l){ for (const g of this.groups()) if (g.base === l || g.clips.includes(l)) return g.base; return l; }
}
Studio.Doc = Doc;

// ---------------- 歷史 ----------------
class History {
  constructor(){ this.undoS = []; this.redoS = []; this.max = 24; this.onchange = null; }
  push(e){ this.undoS.push(e); if (this.undoS.length > this.max) this.undoS.shift(); this.redoS.length = 0; this.onchange && this.onchange(); }
  undo(){ const e = this.undoS.pop(); if (!e) return false; e.undo(); this.redoS.push(e); this.onchange && this.onchange(); return true; }
  redo(){ const e = this.redoS.pop(); if (!e) return false; e.redo(); this.undoS.push(e); this.onchange && this.onchange(); return true; }
  clear(){ this.undoS.length = 0; this.redoS.length = 0; this.onchange && this.onchange(); }
  // 針對一張畫布的像素變更：先 begin 拿到快照，改完後 commit(bbox) 只保留變更區域
  beginPixels(canvas){ return { canvas, before: U.cloneCanvas(canvas) }; }
  commitPixels(snap, bbox, layer){
    const { canvas, before } = snap; const w = canvas.width, h = canvas.height;
    let b = bbox ? { x: Math.max(0, Math.floor(bbox.x)), y: Math.max(0, Math.floor(bbox.y)), w: Math.ceil(bbox.w) + 1, h: Math.ceil(bbox.h) + 1 } : { x: 0, y: 0, w, h };
    b.w = Math.min(b.w, w - b.x); b.h = Math.min(b.h, h - b.y); if (b.w <= 0 || b.h <= 0) return;
    const bef = before.getContext('2d').getImageData(b.x, b.y, b.w, b.h), aft = canvas.getContext('2d').getImageData(b.x, b.y, b.w, b.h);
    const put = (img) => { canvas.getContext('2d').putImageData(img, b.x, b.y); if (layer) layer.thumbDirty = true; };
    this.push({ undo: () => put(bef), redo: () => put(aft) });
  }
}
Studio.History = History;

// ---------------- 合成 ----------------
const Comp = Studio.comp = {
  pool: [],
  tmp(w, h){ let c = this.pool.pop(); if (!c || c.width !== w || c.height !== h) c = U.mkCanvas(w, h); else { const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, w, h); } return c; },
  free(c){ if (this.pool.length < 8) this.pool.push(c); },
  tinted(src, color){ const c = this.tmp(src.width, src.height), x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c; },
  /** 把文件合成到 target。opts: {frame, override:{layerId: canvas}, onion, skipActive, rigDraw} */
  render(doc, target, opts = {}){
    const frame = opts.frame == null ? doc.frame : opts.frame, w = doc.w, h = doc.h;
    const out = target.getContext('2d'); out.save(); out.setTransform(1, 0, 0, 1, 0, 0); out.globalCompositeOperation = 'source-over'; out.globalAlpha = 1; out.clearRect(0, 0, w, h);
    const src = (l) => (opts.override && opts.override[l.id]) || l.canvas(frame);
    for (const g of doc.groups()) {
      if (!g.base.visible) continue;
      const vis = g.clips.filter(c => c.visible);
      if (!vis.length) { out.globalAlpha = g.base.opacity; out.globalCompositeOperation = g.base.blend; out.drawImage(src(g.base), 0, 0); continue; }
      const t = this.tmp(w, h), tx = t.getContext('2d'); tx.drawImage(src(g.base), 0, 0);
      for (const c of vis) {
        const t2 = this.tmp(w, h), x2 = t2.getContext('2d'); x2.globalAlpha = c.opacity; x2.drawImage(src(c), 0, 0); x2.globalAlpha = 1; x2.globalCompositeOperation = 'destination-in'; x2.drawImage(src(g.base), 0, 0);
        tx.globalCompositeOperation = c.blend; tx.drawImage(t2, 0, 0); this.free(t2);
      }
      out.globalAlpha = g.base.opacity; out.globalCompositeOperation = g.base.blend; out.drawImage(t, 0, 0); this.free(t);
    }
    // 洋蔥皮
    if (opts.onion) {
      out.globalCompositeOperation = 'source-over';
      for (const l of doc.layers) if (l.animated && l.visible) {
        const ci = l.celIndex(frame); const prev = Object.keys(l.cels).map(Number).filter(k => k < ci).sort((a, b) => b - a)[0]; const next = Object.keys(l.cels).map(Number).filter(k => k > ci).sort((a, b) => a - b)[0];
        if (prev != null) { const t = this.tinted(l.cels[prev], '#ff6b8a'); out.globalAlpha = 0.3; out.drawImage(t, 0, 0); this.free(t); }
        if (next != null) { const t = this.tinted(l.cels[next], '#59c2ff'); out.globalAlpha = 0.3; out.drawImage(t, 0, 0); this.free(t); }
      }
    }
    out.restore();
    return target;
  },
};

// ---------------- 儲存（IndexedDB）----------------
const Store = Studio.store = {
  db: null,
  open(){ return new Promise((res, rej) => { if (this.db) return res(this.db); const r = indexedDB.open('somnia-studio', 1); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' }); }; r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
  async put(rec){ const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('projects', 'readwrite'); t.objectStore('projects').put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async get(id){ const d = await this.open(); return new Promise((res, rej) => { const r = d.transaction('projects').objectStore('projects').get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async list(){ const d = await this.open(); return new Promise((res, rej) => { const r = d.transaction('projects').objectStore('projects').getAll(); r.onsuccess = () => res((r.result || []).map(p => ({ id: p.id, name: p.name, updated: p.updated, thumb: p.thumb, w: p.w, h: p.h }))); r.onerror = () => rej(r.error); }); },
  async del(id){ const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('projects', 'readwrite'); t.objectStore('projects').delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
};

// ---------------- 序列化 ----------------
const Ser = Studio.ser = {
  // 文件 -> {meta, blobs:{key: Blob}}；blobs 的 key = layerId/frame
  async pack(doc, asDataURL){
    const meta = { v: 2, id: doc.id, name: doc.name, w: doc.w, h: doc.h, frame: doc.frame, frames: doc.frames, fps: doc.fps, params: doc.params, anim: doc.anim, activeId: doc.activeId, symmetry: doc.symmetry, layers: [] };
    const blobs = {};
    for (const l of doc.layers) {
      const cels = [];
      for (const k of Object.keys(l.cels)) { const key = l.id + '_' + k; cels.push(+k); blobs[key] = asDataURL ? l.cels[k].toDataURL('image/png') : await U.toBlob(l.cels[k]); }
      meta.layers.push({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, clip: l.clip, alphaLock: l.alphaLock, locked: l.locked, animated: l.animated, cels, part: l.part });
    }
    return { meta, blobs };
  },
  async unpack(meta, blobs){
    const doc = new Doc(meta.w, meta.h, meta.name); doc.id = meta.id || doc.id; doc.frame = meta.frame || 0; doc.frames = meta.frames || 1; doc.fps = meta.fps || 8; const PRE = {}; for (const p of Doc.PARAM_PRESETS()) PRE[p.id] = p; doc.params = (meta.params || Doc.defaultParams()).map(p => PRE[p.id] ? Object.assign({}, p, PRE[p.id], { v: p.v || 0 }) : p); doc.anim = meta.anim || doc.anim; doc.symmetry = !!meta.symmetry;
    for (const lm of meta.layers) {
      const l = new Layer(doc, lm.name); l.id = lm.id; Object.assign(l, { visible: lm.visible, opacity: lm.opacity, blend: lm.blend, clip: lm.clip, alphaLock: lm.alphaLock, locked: lm.locked, animated: lm.animated }); l.part = Object.assign(l.part, lm.part || {}); if (!l.part.base) l.part.base = Layer.zeroPose(); if (!l.part.keys) l.part.keys = {};
      l.cels = {};
      for (const k of lm.cels) { const b = blobs[l.id + '_' + k]; const c = U.mkCanvas(doc.w, doc.h); if (b) { const im = await U.loadImage(typeof b === 'string' ? b : URL.createObjectURL(b)); c.getContext('2d').drawImage(im, 0, 0); } l.cels[k] = c; }
      if (!l.cels[0]) l.cels[0] = U.mkCanvas(doc.w, doc.h);
      doc.layers.push(l);
    }
    doc.activeId = meta.activeId && doc.layers.find(l => l.id === meta.activeId) ? meta.activeId : (doc.layers[doc.layers.length - 1] || {}).id;
    return doc;
  },
  thumb(doc, size){
    const c = Comp.render(doc, U.mkCanvas(doc.w, doc.h)); const s = size / Math.max(doc.w, doc.h); const t = U.mkCanvas(Math.max(1, doc.w * s), Math.max(1, doc.h * s)); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); return t.toDataURL('image/png');
  },
};
