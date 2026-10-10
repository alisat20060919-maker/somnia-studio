'use strict';
// 二進位 plist（bplist00）解析 ＋ NSKeyedArchiver 物件還原
(function(){
class UID { constructor(n){ this.n = n; } }
function parseBplist(buf){
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const magic = String.fromCharCode(...u8.slice(0, 8)); if (!magic.startsWith('bplist')) throw new Error('不是 binary plist');
  const t = buf.byteLength - 32; const offSize = u8[t + 6], refSize = u8[t + 7];
  const numObjects = Number(dv.getBigUint64(t + 8)), top = Number(dv.getBigUint64(t + 16)), tableOff = Number(dv.getBigUint64(t + 24));
  const readUInt = (pos, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + u8[pos + i]; return v; };
  const offsets = []; for (let i = 0; i < numObjects; i++) offsets.push(readUInt(tableOff + i * offSize, offSize));
  const objs = new Array(numObjects); const dec16 = new TextDecoder('utf-16be'), dec8 = new TextDecoder('utf-8');
  function readLen(pos, lo){ if (lo < 15) return [lo, pos + 1]; const m = u8[pos + 1], n = 1 << (m & 0xf); return [readUInt(pos + 2, n), pos + 2 + n]; }
  function parse(i){ if (objs[i] !== undefined) return objs[i]; const pos = offsets[i], b = u8[pos], hi = b >> 4, lo = b & 0xf; let v;
    if (hi === 0) v = lo === 8 ? false : lo === 9 ? true : null;
    else if (hi === 1) { const n = 1 << lo; v = n <= 4 ? readUInt(pos + 1, n) : Number(dv.getBigInt64(pos + 1 + (n - 8))); if (n === 16) v = Number(dv.getBigInt64(pos + 9)); }
    else if (hi === 2) v = lo === 2 ? dv.getFloat32(pos + 1) : dv.getFloat64(pos + 1);
    else if (hi === 3) v = new Date((dv.getFloat64(pos + 1) + 978307200) * 1000);
    else if (hi === 4) { const [n, p] = readLen(pos, lo); v = u8.slice(p, p + n); }
    else if (hi === 5) { const [n, p] = readLen(pos, lo); v = dec8.decode(u8.slice(p, p + n)); }
    else if (hi === 6) { const [n, p] = readLen(pos, lo); v = dec16.decode(u8.slice(p, p + n * 2)); }
    else if (hi === 8) v = new UID(readUInt(pos + 1, lo + 1));
    else if (hi === 0xa || hi === 0xc) { const [n, p] = readLen(pos, lo); v = []; for (let k = 0; k < n; k++) v.push(new UID(readUInt(p + k * refSize, refSize))); }
    else if (hi === 0xd) { const [n, p] = readLen(pos, lo); v = { __dict: true, keys: [], vals: [] }; for (let k = 0; k < n; k++) { v.keys.push(new UID(readUInt(p + k * refSize, refSize))); v.vals.push(new UID(readUInt(p + (n + k) * refSize, refSize))); } }
    else throw new Error('未知的 plist 型別 ' + hi);
    objs[i] = v; return v; }
  for (let i = 0; i < numObjects; i++) parse(i);
  // 把 UID 參照換成實體（dict → 一般物件）
  const resolved = new Array(numObjects);
  function res(i){ if (resolved[i] !== undefined) return resolved[i]; const v = objs[i]; let out;
    if (Array.isArray(v)) { out = []; resolved[i] = out; for (const u of v) out.push(res(u.n)); }
    else if (v && v.__dict) { out = {}; resolved[i] = out; v.keys.forEach((k, j) => { out[res(k.n)] = v.vals[j]; }); for (const k in out) out[k] = out[k] instanceof UID ? res(out[k].n) : out[k]; }
    else { out = v; resolved[i] = out; }
    return out; }
  return { root: res(top), objects: objs, res };
}
// NSKeyedArchiver：$objects + $top.root，把 NS.keys/NS.objects、NS.string 攤平
function unarchive(buf){
  const pl = parseBplist(buf); const root = pl.root; const objs = root['$objects'];
  const memo = new Map();
  function R(v, depth){ depth = depth || 0; if (depth > 40) return null;
    if (v instanceof UID) v = objs[v.n];
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Uint8Array) && !(v instanceof Date)) {
      if (memo.has(v)) return memo.get(v);
      if ('NS.keys' in v && 'NS.objects' in v) { const o = {}; memo.set(v, o); const ks = v['NS.keys'], vs = v['NS.objects']; for (let i = 0; i < ks.length; i++) o[String(R(ks[i], depth + 1))] = R(vs[i], depth + 1); return o; }
      if ('NS.objects' in v) { const a = []; memo.set(v, a); for (const x of v['NS.objects']) a.push(R(x, depth + 1)); return a; }
      if ('NS.string' in v) return v['NS.string'];
      const o = {}; memo.set(v, o); for (const k in v) if (k !== '$class') o[k] = R(v[k], depth + 1); return o; }
    if (Array.isArray(v)) return v.map(x => R(x, depth + 1));
    return v; }
  const top = root['$top']; return R(top.root instanceof UID ? top.root : top['root']);
}
window.BPlist = { parse: parseBplist, unarchive, UID };
})();
