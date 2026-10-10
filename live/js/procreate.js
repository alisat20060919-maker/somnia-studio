'use strict';
// 讀 .procreate：圖層名稱／順序／不透明度／隱藏／剪裁，每層一張完整尺寸的 canvas；方向用縮圖自動校正
(function(){
const T = 256;
async function loadProcreate(file, onProgress){
  const zip = await JSZip.loadAsync(file);
  const arch = zip.file('Document.archive'); if (!arch) throw new Error('不是 .procreate 檔（找不到 Document.archive）');
  const root = BPlist.unarchive(await arch.async('arraybuffer'));
  const [W, H] = String(root.size).match(/\d+/g).map(Number); const tile = root.tileSize || T;
  const layersMeta = (root.layers || []).map(l => ({ name: l.name || '', uuid: l.UUID, opacity: l.opacity == null ? 1 : l.opacity, hidden: !!l.hidden, blend: l.blend || 0, clipped: !!l.clipped, type: l.type }));
  // 解每一層的 tile
  const layers = []; let done = 0;
  for (const m of layersMeta) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
    const files = Object.keys(zip.files).filter(f => f.startsWith(m.uuid + '/') && f.endsWith('.lz4'));
    for (const f of files) { const mm = /\/(\d+)~(\d+)\.lz4$/.exec(f); if (!mm) continue; const raw = LZ4.appleLZ4(new Uint8Array(await zip.file(f).async('arraybuffer')), tile * tile * 4); if (raw.length < tile * tile * 4) continue;
      const img = new ImageData(new Uint8ClampedArray(raw.buffer, raw.byteOffset, tile * tile * 4), tile, tile); ctx.putImageData(img, +mm[1] * tile, +mm[2] * tile); }
    layers.push(Object.assign({ canvas: cv }, m)); done++; onProgress && onProgress(done / layersMeta.length);
  }
  // 方向：試 8 種翻轉，挑跟 QuickLook 縮圖最像的
  let thumb = null; const tf = zip.file('QuickLook/Thumbnail.png'); if (tf) { const url = URL.createObjectURL(await tf.async('blob')); thumb = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; }); }
  const merged = document.createElement('canvas'); merged.width = W; merged.height = H; const mx = merged.getContext('2d');
  for (const l of layers) if (!l.hidden) { mx.globalAlpha = l.opacity; mx.drawImage(l.canvas, 0, 0); }
  const xf = thumb ? bestTransform(merged, thumb) : (root.orientation === 3 ? 'transverse' : 'none');
  for (const l of layers) l.canvas = applyTransform(l.canvas, xf);
  const out = { w: layers.length ? layers[0].canvas.width : W, h: layers.length ? layers[0].canvas.height : H, name: (file.name || '未命名').replace(/\.procreate$/i, ''), layers: layers.reverse(), transform: xf }; // Procreate 的 layers[0] 是最上層；這裡改成 index 0 在最底
  return out;
}
const XFORMS = ['none', 'rot90', 'rot180', 'rot270', 'flipH', 'flipV', 'transpose', 'transverse'];
function applyTransform(cv, xf){ if (xf === 'none') return cv; const W = cv.width, H = cv.height; const swap = ['rot90', 'rot270', 'transpose', 'transverse'].includes(xf); const o = document.createElement('canvas'); o.width = swap ? H : W; o.height = swap ? W : H; const x = o.getContext('2d');
  // 每個都是 old(x,y) → new
  const M = { rot90: [0, 1, -1, 0, H, 0], rot180: [-1, 0, 0, -1, W, H], rot270: [0, -1, 1, 0, 0, W], flipH: [-1, 0, 0, 1, W, 0], flipV: [1, 0, 0, -1, 0, H], transpose: [0, 1, 1, 0, 0, 0], transverse: [0, -1, -1, 0, H, W] }[xf];
  x.setTransform(...M); x.drawImage(cv, 0, 0); return o; }
function bestTransform(merged, thumb){ const S = 64; const tc = document.createElement('canvas'); tc.width = tc.height = S; const tx = tc.getContext('2d'); tx.drawImage(thumb, 0, 0, S, S); const td = tx.getImageData(0, 0, S, S).data;
  const sig = (d) => { const a = new Float32Array(S * S); for (let i = 0; i < S * S; i++) { const al = d[i * 4 + 3] / 255; const lum = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255; a[i] = al * (1 - lum) + (1 - al) * 0; } return a; }; // 縮圖是白底，這裡用「有多暗」當特徵
  const tsig = sig(td); let best = 'none', bestScore = -Infinity;
  for (const xf of XFORMS) { const c = applyTransform(merged, xf); const sc = document.createElement('canvas'); sc.width = sc.height = S; const sx = sc.getContext('2d'); sx.fillStyle = '#fff'; sx.fillRect(0, 0, S, S); sx.drawImage(c, 0, 0, S, S); const s = sig(sx.getImageData(0, 0, S, S).data); let dot = 0, na = 0, nb = 0; for (let i = 0; i < S * S; i++) { dot += s[i] * tsig[i]; na += s[i] * s[i]; nb += tsig[i] * tsig[i]; } const score = dot / Math.sqrt(na * nb + 1e-9); if (score > bestScore) { bestScore = score; best = xf; } }
  return best; }
window.Procreate = { load: loadProcreate, applyTransform, XFORMS };
})();
