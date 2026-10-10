'use strict';
// LZ4 區塊解壓 ＋ Apple 的 bv41 串流框架（Procreate 的 .lz4 tile 用這個）
(function(){
// 把一個 LZ4 block 解到 out[outPos..]，match 可以往回參照 out 裡前面的區塊（串流字典）
function decodeBlock(src, out, outPos, expectEnd){
  let i = 0; const n = src.length;
  while (i < n) {
    const token = src[i++]; let lit = token >> 4;
    if (lit === 15) { let b; do { b = src[i++]; lit += b; } while (b === 255); }
    for (let k = 0; k < lit; k++) out[outPos++] = src[i++];
    if (i >= n) break;
    const off = src[i] | (src[i + 1] << 8); i += 2; if (!off) throw new Error('LZ4 offset 0');
    let ml = token & 15; if (ml === 15) { let b; do { b = src[i++]; ml += b; } while (b === 255); } ml += 4;
    let from = outPos - off; for (let k = 0; k < ml; k++) out[outPos++] = out[from++];
  }
  return outPos;
}
function appleLZ4(u8, expectedSize){
  const out = new Uint8Array(Math.max(expectedSize || 0, 1 << 20)); let pos = 0, i = 0; const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  while (i + 4 <= u8.length) {
    const m = String.fromCharCode(u8[i], u8[i + 1], u8[i + 2], u8[i + 3]);
    if (m === 'bv41') { const dsz = dv.getUint32(i + 4, true), csz = dv.getUint32(i + 8, true); pos = decodeBlock(u8.subarray(i + 12, i + 12 + csz), out, pos, pos + dsz); i += 12 + csz; }
    else if (m === 'bv4-') { const sz = dv.getUint32(i + 4, true); out.set(u8.subarray(i + 8, i + 8 + sz), pos); pos += sz; i += 8 + sz; }
    else if (m === 'bv4$') break;
    else throw new Error('未知的 LZ4 區塊 ' + m);
  }
  return out.subarray(0, pos);
}
window.LZ4 = { decodeBlock, appleLZ4 };
})();
