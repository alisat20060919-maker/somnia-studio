'use strict';
// ======================================================================
//  骨架／變形（Live2D 式）：零件＝圖層，軸心、父子、網格變形、動作（參數）關鍵形、時間軸
//  介面：下方「動作」晶片 ＋ 一條大滑桿（兩端＝關鍵姿勢）；拖零件或網格點就是在擺那個關鍵姿勢
// ======================================================================
(function(){
const App = Studio.app, U = Studio.util;
const $ = (s) => document.querySelector(s);
const Z = () => ({ dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, lat: null });
// 參數顯示名稱：優先用參數自己的 lab（Cubism 標準名稱），舊檔沒有就用這張表
const OLD_LABEL = { angX: ['角度X', '看左', '看右'], angY: ['角度Y', '低頭', '抬頭'], bodyX: ['身體旋轉X', '往左', '往右'], breath: ['呼吸', '', '吸氣'], blink: ['眼睛 開閉', '', '閉眼'], mouth: ['嘴 開閉', '', '張嘴'] };
const labelOf = (p) => p.lab ? [p.name, p.lab[0], p.lab[1]] : (OLD_LABEL[p.id] || [p.name, p.min < 0 ? '負向' : '', '正向']);

const Rig = Studio.rig = {
  sel: null, editParam: 'angX', pivotMode: false, showAll: false, time: 0, playing: false, trying: false, drag: null,
  // 每個有畫東西的圖層自動長網格（像 Cubism 的自動網格）
  autoMesh(l){ if (!l || l.part.lattice || l.part.grid) return; if (!U.alphaBounds(l.canvas(0))) return; this.setGrid(l, 3); },
  init(){
    $('#rgParent').onchange = (e) => { const l = this.sel; if (!l) return; const pid = e.target.value || null; if (pid && this.isAncestor(l, App.doc.layers.find(x => x.id === pid))) { App.toast('不能把子零件設成父零件'); this.refresh(); return; } l.part.parent = pid; this.refresh(); App.invalidate(); App.dirty(); };
    $('#rgGrid').onchange = (e) => { const l = this.sel; if (!l) return; this.setGrid(l, +e.target.value); this.refresh(); App.invalidate(); App.dirty(); };
    $('#rgPivot').onclick = (e) => { this.pivotMode = !this.pivotMode; e.target.classList.toggle('on', this.pivotMode); App.closePopups(); App.toast(this.pivotMode ? '拖曳畫面上的 ⊕ 來移動軸心' : '軸心模式關閉'); App.invalidate(); };
    $('#rgResetKey').onclick = () => { const l = this.sel; if (!l) return; const t = this.target(l); if (t.isBase) { l.part.base = Z(); App.toast('基本姿勢已重設'); } else { delete l.part.keys[t.pid][t.k]; App.toast('這個關鍵姿勢已清除'); } this.refreshParams(); App.invalidate(); App.dirty(); };
    $('#rgShowAll').onclick = (e) => { this.showAll = !this.showAll; e.target.classList.toggle('on', this.showAll); App.invalidate(); };
    $('#rgAutoParent').onclick = () => { this.autoParent(); this.refresh(); App.invalidate(); App.dirty(); App.toast('已依名稱設定父子關係'); };
    $('#rgAutoRig').onclick = async () => { const known = App.doc.layers.filter(l => this.kind(l) !== 'other'); const unknown = App.doc.layers.filter(l => this.kind(l) === 'other');
      if (!known.length) { App.modal(`<h2>一鍵骨架需要分好零件</h2><div class="dim">目前的圖層（${App.doc.layers.map(l => l.name).join('、')}）我認不出哪個是頭、眼睛、身體。</div><pre>做法：
1. 回「繪圖」，用「選取」圈出頭的範圍 → 下面按「切到新圖層」→ 選 head（頭）
2. 同樣切出 eye_normal（眼睛）、mouth_normal（嘴）、hair_front（前髮）、body（身體）、arm_L／arm_R（手臂）…
3. 再回來按「一鍵骨架」，或直接選零件、拉滑桿到一端、拖零件擺姿勢
一張單層的線稿沒有分零件，是沒辦法動的（Live2D 也一樣）。</pre><div class="btns"><button class="sm pri" onclick="Studio.app.closeModal()">知道了</button></div>`); return; }
      if (!(await App.confirm(`認得的零件：${known.map(l => l.name).join('、')}${unknown.length ? '\n認不得（不會動）：' + unknown.map(l => l.name).join('、') : ''}\n要自動做出頭轉、呼吸、眨眼、嘴開合的姿勢嗎？會覆蓋這些動作現有的姿勢。`))) return;
      this.autoParent(); this.autoRig(); this.refresh(); this.refreshParams(); App.invalidate(); App.dirty(); App.toast('一鍵骨架完成，按「▶ 試玩」看看'); };
    $('#prAdd').onclick = () => this.addParamDialog(); $('#pkNew').onclick = () => this.addParamDialog();
    $('#pkAdd2').onclick = () => this.addKeys(2); $('#pkAdd3').onclick = () => this.addKeys(3);
    $('#pkDel').onclick = () => { const l = this.sel, p = this.param(); if (!l || !p) return; delete l.part.keys[p.id]; this.refreshParams(); App.invalidate(); App.dirty(); App.toast('已刪除「' + l.name + '」在「' + p.name + '」的關鍵形'); };
    $('#pkReset').onclick = () => { for (const p of App.doc.params) p.v = 0; this.refreshParams(); App.invalidate(); };
    $('#rgTry').onclick = () => this.trying ? this.stopTry() : this.startTry();
    $('#rgTimelineBtn').onclick = (e) => { const tl = $('#rigTimeline'); tl.hidden = !tl.hidden; e.target.classList.toggle('on', !tl.hidden); this.refreshKeys(); };
    $('#rkMin').onclick = () => this.setKey('min'); $('#rkMax').onclick = () => this.setKey('max');
    const bs = $('#bigSlider'); let on = false; const h = (e) => { const p = this.param(); if (!p) return; const r = bs.getBoundingClientRect(); let t = U.clamp((e.clientX - r.left) / r.width, 0, 1); for (const k of [0, 0.5, 1]) if (Math.abs(t - k) < 0.05) t = k; p.v = Math.round((p.min + (p.max - p.min) * t) * 100) / 100; this.refreshParams(); App.invalidate(); };
    bs.addEventListener('pointerdown', (e) => { on = true; bs.setPointerCapture(e.pointerId); h(e); }); bs.addEventListener('pointermove', (e) => { if (on) h(e); }); bs.addEventListener('pointerup', () => on = false);
    $('#rgPlay').onclick = () => this.playing ? this.stop() : this.play();
    $('#rgDur').onchange = (e) => { App.doc.anim.duration = U.clamp(+e.target.value || 3, 0.5, 30); this.refreshKeys(); App.dirty(); };
    $('#rgTime').oninput = (e) => { this.time = (+e.target.value / 1000) * App.doc.anim.duration; this.applyTracks(); this.refreshKeys(); this.refreshParams(); App.invalidate(); };
    $('#rgKey').onclick = () => { const d = App.doc; for (const p of d.params) { const tr = d.anim.tracks[p.id] = (d.anim.tracks[p.id] || []).filter(k => Math.abs(k.t - this.time) > 0.02); tr.push({ t: this.time, v: p.v }); tr.sort((a, b) => a.t - b.t); } this.refreshKeys(); App.toast('已記錄 ' + this.time.toFixed(2) + 's 的姿勢'); App.dirty(); };
    $('#rgKeyDel').onclick = () => { const d = App.doc; for (const pid in d.anim.tracks) d.anim.tracks[pid] = d.anim.tracks[pid].filter(k => Math.abs(k.t - this.time) > 0.02); this.refreshKeys(); App.dirty(); };
    $('#rgZero').onclick = () => { for (const p of App.doc.params) p.v = 0; this.refreshParams(); App.invalidate(); };
    $('#rgRec').onclick = () => this.record();
  },
  // Cubism 的「追加2點／3點」：讓選中的零件登記到這個參數上（關鍵形先是零差量，之後拖零件再改）
  addKeys(n){ const l = this.sel, p = this.param(); if (!l || !p) { App.toast('先選零件和參數'); return; } const keys = l.part.keys[p.id] = l.part.keys[p.id] || {}; const ks = n === 3 && p.min < 0 ? [p.min, p.max] : [p.max]; if (p.min < 0) ks.unshift(p.min); for (const k of new Set(ks)) if (k !== 0 && !keys[k]) keys[k] = Z(); this.refreshParams(); App.dirty(); App.toast('「' + l.name + '」已登記到「' + p.name + '」'); },
  async addParamDialog(){ const have = new Set(App.doc.params.map(p => p.id)); const presets = Studio.Doc.PARAM_PRESETS().filter(p => !have.has(p.id));
    const b = App.modal(`<h2>追加參數</h2><div class="dim small">Cubism 標準參數（匯出時會帶 Cubism 的 ID 與範圍）</div><div class="list" style="max-height:40vh;overflow:auto;margin:8px 0">${presets.map(p => `<div class="it" data-id="${p.id}"><span class="nm">${p.name}</span><span class="meta">${p.l2d} · ${p.range[0]}~${p.range[1]}</span></div>`).join('')}</div><div class="row"><input type="text" id="npName" class="grow" placeholder="或輸入自訂名稱"><label><input type="checkbox" id="npTwo" checked> 兩個方向</label><button class="sm pri" id="npOk">追加</button></div><div class="btns"><button class="sm" onclick="Studio.app.closeModal()">關閉</button></div>`);
    b.querySelectorAll('.it').forEach(it => it.onclick = () => { const p = presets.find(x => x.id === it.dataset.id); App.doc.params.push(Object.assign({ v: 0 }, p)); this.editParam = p.id; App.closeModal(); this.refreshParams(); App.dirty(); });
    b.querySelector('#npOk').onclick = () => { const name = b.querySelector('#npName').value.trim(); if (!name) return; const id = U.uid(); App.doc.params.push({ id, name, min: b.querySelector('#npTwo').checked ? -1 : 0, max: 1, v: 0 }); this.editParam = id; App.closeModal(); this.refreshParams(); App.dirty(); }; },
  enter(){ for (const l of App.doc.layers) { l.part._bb = null; if (l.visible) this.autoMesh(l); } this.sel = App.doc.active; this.autoMesh(this.sel); if (!App.doc.params.find(p => p.id === this.editParam)) this.editParam = (App.doc.params[0] || {}).id; this.refresh(); this.refreshParams(); this.refreshKeys(); App.hint('點一個圖層 → 下面選動作、滑桿拉到一端 → 拉網格點或拖整塊 → 拉回中間看它動');
    if (!localStorage.getItem('somnia-righelp')) { $('#rigHelp').hidden = false; $('#rigHelpOk').onclick = () => { $('#rigHelp').hidden = true; localStorage.setItem('somnia-righelp', '1'); }; } },
  leave(){ this.stop(); this.stopTry(); this.pivotMode = false; $('#rgPivot').classList.remove('on'); },
  select(l){ this.sel = l; this.autoMesh(l); this.refresh(); this.refreshParams(); App.invalidate(); },
  param(){ return App.doc.params.find(p => p.id === this.editParam) || null; },
  isAncestor(a, b){ let p = b, n = 0; while (p && n++ < 100) { if (p === a) return true; p = p.part.parent ? App.doc.layers.find(x => x.id === p.part.parent) : null; } return false; },
  refresh(){
    const l = this.sel; const sel = $('#rgParent'); sel.innerHTML = '<option value="">（無）</option>' + App.doc.layers.filter(x => x !== l).map(x => `<option value="${x.id}" ${l && l.part.parent === x.id ? 'selected' : ''}>${x.name}</option>`).join('');
    $('#rgGrid').value = l ? (l.part.grid || 0) : 0;
    const box = $('#partList'); box.innerHTML = ''; [...App.doc.layers].reverse().forEach(x => { const it = document.createElement('div'); it.className = 'it' + (x === l ? ' on' : ''); const par = x.part.parent && App.doc.layers.find(y => y.id === x.part.parent); it.innerHTML = `<span class="nm">${x.name}</span><span class="meta">${par ? '↳ ' + par.name : ''}${x.part.grid ? ' · 網格' + x.part.grid : ''}${Object.keys(x.part.keys).length ? ' · ' + Object.keys(x.part.keys).length + '動作' : ''}</span>`; it.onclick = () => App.setActive(x); box.appendChild(it); });
  },
  // ---- 幾何 ----
  bounds(l){ if (!l.part._bb) l.part._bb = U.alphaBounds(l.canvas(0)) || { x: 0, y: 0, w: App.doc.w, h: App.doc.h }; return l.part._bb; },
  pivot(l){ if (!l.part.pivot) { const b = this.bounds(l); l.part.pivot = { x: b.x + b.w / 2, y: b.y + b.h / 2 }; } return l.part.pivot; },
  setGrid(l, n){ l.part.grid = n; l.part.base.lat = null; for (const pid in l.part.keys) for (const k in l.part.keys[pid]) l.part.keys[pid][k].lat = null;
    if (!n) { l.part.lattice = null; return; } const b = this.bounds(l); const m = 6; const x0 = b.x - m, y0 = b.y - m, w = b.w + m * 2, h = b.h + m * 2; const pts = []; for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) pts.push({ x: x0 + w * c / n, y: y0 + h * r / n }); l.part.lattice = { n, pts }; },
  paramV(pid){ const p = App.doc.params.find(p => p.id === pid); return p ? p.v : 0; },
  target(l){ const ep = this.param(); if (!ep || ep.v === 0) return { isBase: true, pose: l.part.base };
    const k = ep.v === ep.min ? ep.min : ep.v === ep.max ? ep.max : null; if (k == null) return { isBase: true, pose: l.part.base, warn: true };
    const keys = l.part.keys[ep.id] = l.part.keys[ep.id] || {}; const pose = keys[k] = keys[k] || Z(); return { isBase: false, pid: ep.id, k, pose }; },
  pose(l){ const P = l.part, b = P.base; const out = { dx: b.dx, dy: b.dy, rot: b.rot, sx: b.sx, sy: b.sy, lat: null }; const n = P.lattice ? P.lattice.pts.length : 0; if (n) { out.lat = new Float32Array(n * 2); if (b.lat) for (let i = 0; i < n * 2; i++) out.lat[i] += b.lat[i] || 0; }
    for (const pid in P.keys) { const keys = P.keys[pid]; const ks = Object.keys(keys).map(Number); if (!ks.length) continue; const v = this.paramV(pid); let k1;
      if (v > 0) { k1 = Math.min(...ks.filter(k => k > 0), Infinity); if (k1 === Infinity) continue; } else if (v < 0) { k1 = Math.max(...ks.filter(k => k < 0), -Infinity); if (k1 === -Infinity) continue; } else continue;
      const t = U.clamp(v / k1, 0, 1); const p1 = keys[k1];
      out.dx += p1.dx * t; out.dy += p1.dy * t; out.rot += p1.rot * t; out.sx *= U.lerp(1, p1.sx, t); out.sy *= U.lerp(1, p1.sy, t);
      if (n && p1.lat) for (let i = 0; i < n * 2; i++) out.lat[i] += (p1.lat[i] || 0) * t; }
    return out; },
  local(l, pose){ const pv = this.pivot(l); return new DOMMatrix().translate(pv.x + pose.dx, pv.y + pose.dy).rotate(pose.rot * 180 / Math.PI).scale(pose.sx, pose.sy).translate(-pv.x, -pv.y); },
  world(l, memo){ memo = memo || new Map(); if (memo.has(l.id)) return memo.get(l.id); const pose = this.pose(l); let m = this.local(l, pose); const par = l.part.parent && App.doc.layers.find(x => x.id === l.part.parent); if (par && par !== l && !memo.has('__' + l.id)) { memo.set('__' + l.id, 1); m = this.world(par, memo).multiply(m); } memo.set(l.id, m); return m; },
  latticePts(l, pose){ const L = l.part.lattice; if (!L) return null; return L.pts.map((p, i) => ({ x: p.x + (pose.lat ? pose.lat[i * 2] : 0), y: p.y + (pose.lat ? pose.lat[i * 2 + 1] : 0) })); },
  // ---- 自動：父子 ＋ 常見動作 ----
  // 零件角色：使用者在零件面板指定的優先，否則從圖層名稱猜（中／英／日）
  KINDS: [['head', '頭／臉'], ['body', '身體'], ['eye', '眼睛'], ['mouth', '嘴'], ['brow', '眉毛'], ['hairF', '前髮'], ['hairB', '後髮'], ['hat', '頭飾／帽'], ['armL', '左手臂'], ['armR', '右手臂'], ['leg', '腿'], ['cloth', '飄動物（披風、裙）'], ['weapon', '武器／道具'], ['blush', '腮紅'], ['other', '不動／跟著父零件']],
  kind(l){ if (l.part && l.part.role) return l.part.role; const n = (l.name || '').toLowerCase();
    if (/hair_front|前髮|前发|前髪|瀏海|刘海|bang|fringe/.test(n)) return 'hairF'; if (/hair_back|後髮|后发|後髪|back ?hair/.test(n)) return 'hairB'; if (/hair|髮|发|髪/.test(n)) return 'hairF';
    if (/brow|眉/.test(n)) return 'brow'; if (/eye|眼|目|瞳|睫/.test(n)) return 'eye'; if (/mouth|lip|嘴|口|唇/.test(n)) return 'mouth'; if (/blush|cheek|腮|頬|紅暈/.test(n)) return 'blush';
    if (/hat|cap|頭飾|帽|accessor|飾|ribbon|蝴蝶結|角|耳/.test(n)) return 'hat'; if (/head|face|頭|臉|脸|顔|顏/.test(n)) return 'head';
    if (/arm_l|left ?arm|左手|左腕|左臂/.test(n)) return 'armL'; if (/arm_r|right ?arm|右手|右腕|右臂/.test(n)) return 'armR'; if (/arm|hand|手|腕/.test(n)) return 'armL';
    if (/leg|foot|腿|脚|腳|足|鞋/.test(n)) return 'leg'; if (/cloth|cape|skirt|scarf|tail|披|裙|飄|围巾|圍巾|尾|リボン|マント/.test(n)) return 'cloth'; if (/weapon|武器|道具|wand|staff|sword|杖|剣|劍/.test(n)) return 'weapon';
    if (/body|torso|身|軀|体|服|衣|胸/.test(n)) return 'body'; return 'other'; },
  autoParent(){ const d = App.doc; const head = d.layers.find(l => this.kind(l) === 'head'), body = d.layers.find(l => this.kind(l) === 'body');
    for (const l of d.layers) { const k = this.kind(l); if (['eye', 'mouth', 'brow', 'hairF', 'hairB', 'hat', 'blush'].includes(k) && head) l.part.parent = head.id; else if (['head', 'armL', 'armR', 'cloth', 'weapon', 'leg'].includes(k) && body && l !== body) l.part.parent = body.id; else if (l.clip) { const base = d.baseOf(l); if (base !== l) l.part.parent = base.id; } }
    // 軸心：身體與頭在底部中央（脖子），手臂在肩膀，眼睛嘴巴在中央
    for (const l of d.layers) { const k = this.kind(l), b = this.bounds(l); if (k === 'body' || k === 'head' || k === 'leg') l.part.pivot = { x: b.x + b.w / 2, y: b.y + b.h * (k === 'head' ? 0.92 : 1) }; else if (k === 'armL') l.part.pivot = { x: b.x + b.w * 0.85, y: b.y + b.h * 0.1 }; else if (k === 'armR') l.part.pivot = { x: b.x + b.w * 0.15, y: b.y + b.h * 0.1 }; else if (k === 'mouth') l.part.pivot = { x: b.x + b.w / 2, y: b.y }; else if (k === 'cloth' || k === 'hairB' || k === 'hairF') l.part.pivot = { x: b.x + b.w / 2, y: b.y + b.h * 0.1 }; } },
  autoRig(){ const d = App.doc; const W = d.w, H = d.h; const set = (l, pid, k, pose) => { l.part.keys[pid] = l.part.keys[pid] || {}; l.part.keys[pid][k] = Object.assign(Z(), pose); };
    for (const l of d.layers) { const k = this.kind(l); const b = this.bounds(l);
      const headish = { head: [0.03, -0.06], hairF: [0.05, -0.04], hairB: [-0.025, 0.02], eye: [0.07, 0], mouth: [0.06, 0], brow: [0.07, 0], hat: [0.045, -0.05], blush: [0.06, 0] }[k];
      if (headish) { const dx = headish[0] * b.w * (k === 'head' ? 1 : 0.6) + (k === 'head' ? W * 0.015 : 0); set(l, 'angX', 1, { dx, rot: headish[1] }); set(l, 'angX', -1, { dx: -dx, rot: -headish[1] }); const dy = (k === 'head' ? 0.03 : 0.06) * b.h; set(l, 'angY', 1, { dy: -dy, sy: k === 'head' ? 1.02 : 1 }); set(l, 'angY', -1, { dy: dy * 0.8, sy: k === 'head' ? 0.98 : 1 }); }
      if (k === 'eye') { set(l, 'blink', 1, { sy: 0.06 }); }
      if (k === 'mouth') { set(l, 'mouth', 1, { sy: 1.6 }); }
      if (k === 'body') { set(l, 'bodyX', 1, { rot: 0.05, dx: W * 0.01 }); set(l, 'bodyX', -1, { rot: -0.05, dx: -W * 0.01 }); set(l, 'breath', 1, { sy: 1.02, dy: -H * 0.002 }); }
      if (k === 'head') { set(l, 'bodyX', 1, { dx: W * 0.01, rot: 0.02 }); set(l, 'bodyX', -1, { dx: -W * 0.01, rot: -0.02 }); set(l, 'breath', 1, { dy: -H * 0.006 }); }
      if (k === 'armL' || k === 'armR') { const s = k === 'armL' ? 1 : -1; set(l, 'bodyX', 1, { rot: 0.04 }); set(l, 'bodyX', -1, { rot: -0.04 }); set(l, 'breath', 1, { rot: 0.015 * s }); }
      if (k === 'cloth' || k === 'hairB') { set(l, 'bodyX', 1, { rot: -0.06 }); set(l, 'bodyX', -1, { rot: 0.06 }); set(l, 'breath', 1, { sy: 1.01 }); }
      if (k === 'weapon') { set(l, 'bodyX', 1, { rot: 0.04 }); set(l, 'bodyX', -1, { rot: -0.04 }); } } },
  // ---- 繪製 ----
  render(doc, target){
    const out = target.getContext('2d'); out.save(); out.setTransform(1, 0, 0, 1, 0, 0); out.clearRect(0, 0, doc.w, doc.h); const memo = new Map();
    for (const l of doc.layers) { if (!l.visible) continue; const pose = this.pose(l); const m = this.world(l, memo); const img = l.canvas(doc.frame);
      out.save(); out.globalAlpha = l.opacity; out.globalCompositeOperation = l.blend; out.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      const L = l.part.lattice; if (!L) out.drawImage(img, 0, 0); else { const n = L.n, src = L.pts, dst = this.latticePts(l, pose); for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const i = r * (n + 1) + c; tri(out, img, src[i], src[i + 1], src[i + n + 1], dst[i], dst[i + 1], dst[i + n + 1]); tri(out, img, src[i + 1], src[i + n + 2], src[i + n + 1], dst[i + 1], dst[i + n + 2], dst[i + n + 1]); } }
      out.restore(); }
    out.restore(); return target; },
  overlay(ctx){ const l = this.sel; const s = App.view.s; if (!l || this.trying) return; const memo = new Map();
    if (this.showAll) for (const o of App.doc.layers) if (o !== l && o.part.lattice && o.visible) { const m = this.world(o, memo), pts = this.latticePts(o, this.pose(o)); ctx.save(); ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f); ctx.strokeStyle = 'rgba(201,191,255,0.25)'; ctx.lineWidth = 1 / s; grid(ctx, o.part.lattice.n, pts); ctx.restore(); }
    const m = this.world(l, memo), pose = this.pose(l); const b = this.bounds(l), pv = this.pivot(l);
    ctx.save(); ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 1.5 / s; ctx.setLineDash([6 / s, 4 / s]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]);
    if (l.part.lattice) { const pts = this.latticePts(l, pose); ctx.strokeStyle = 'rgba(143,242,255,0.8)'; ctx.lineWidth = 1 / s; grid(ctx, l.part.lattice.n, pts); ctx.fillStyle = '#8ff2ff'; for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 5 / s, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
    const P = (x, y) => { const q = m.transformPoint(new DOMPoint(x, y)); return { x: q.x, y: q.y }; };
    const pw = P(pv.x, pv.y); ctx.strokeStyle = this.pivotMode ? '#ff6b8a' : '#ffe08a'; ctx.lineWidth = 2 / s; ctx.beginPath(); ctx.arc(pw.x, pw.y, 9 / s, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(pw.x - 14 / s, pw.y); ctx.lineTo(pw.x + 14 / s, pw.y); ctx.moveTo(pw.x, pw.y - 14 / s); ctx.lineTo(pw.x, pw.y + 14 / s); ctx.stroke();
    const h = this.handles(l); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ffe08a'; for (const q of h.corners) { ctx.beginPath(); ctx.arc(q.x, q.y, 6 / s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(h.top.x, h.top.y); ctx.lineTo(h.rot.x, h.rot.y); ctx.stroke(); ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(h.rot.x, h.rot.y, 7 / s, 0, Math.PI * 2); ctx.fill();
  },
  handles(l){ const m = this.world(l), b = this.bounds(l); const P = (x, y) => { const q = m.transformPoint(new DOMPoint(x, y)); return { x: q.x, y: q.y }; }; const corners = [P(b.x, b.y), P(b.x + b.w, b.y), P(b.x + b.w, b.y + b.h), P(b.x, b.y + b.h)]; const top = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 }; const cen = P(b.x + b.w / 2, b.y + b.h / 2); const dx = top.x - cen.x, dy = top.y - cen.y, L = Math.hypot(dx, dy) || 1; return { corners, top, cen, rot: { x: top.x + dx / L * 36 / App.view.s, y: top.y + dy / L * 36 / App.view.s } }; },
  // ---- 互動 ----
  pointerDown(p){ if (this.trying) return false; const l = this.sel; const s = App.view.s, r = 12 / s;
    if (l) { const m = this.world(l); const inv = m.inverse(); const lp = inv.transformPoint(new DOMPoint(p.x, p.y));
      if (this.pivotMode) { this.drag = { k: 'pivot' }; return true; }
      if (l.part.lattice) { const pts = this.latticePts(l, this.pose(l)); const i = pts.findIndex(q => Math.hypot(q.x - lp.x, q.y - lp.y) < r); if (i >= 0) { this.drag = { k: 'lat', i, p0: { x: lp.x, y: lp.y } }; return true; } }
      const h = this.handles(l); const pose = this.pose(l);
      if (U.dist(p, h.rot) < r) { this.drag = { k: 'rot', a0: Math.atan2(p.y - h.cen.y, p.x - h.cen.x), cen: h.cen, rot0: pose.rot }; return true; }
      if (h.corners.some(q => U.dist(p, q) < r)) { this.drag = { k: 'scale', d0: U.dist(p, h.cen), cen: h.cen, s0: [pose.sx, pose.sy] }; return true; } }
    // 點到哪個零件就選它：先看有沒有碰到像素（線稿很細，所以看周圍 ±6px），沒有的話就看框住點的最小零件；都沒有就拖目前選的零件
    const hitAlpha = (o, q) => { const cv = o.canvas(0); const x0 = Math.max(0, (q.x | 0) - 6), y0 = Math.max(0, (q.y | 0) - 6); const w = Math.min(cv.width - x0, 13), h = Math.min(cv.height - y0, 13); if (w <= 0 || h <= 0) return false; const d = cv.getContext('2d').getImageData(x0, y0, w, h).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return true; return false; };
    let pick = null, best = null, bestArea = Infinity;
    for (let i = App.doc.layers.length - 1; i >= 0; i--) { const o = App.doc.layers[i]; if (!o.visible) continue; const q = this.world(o).inverse().transformPoint(new DOMPoint(p.x, p.y)); const ob = this.bounds(o); if (q.x < ob.x || q.x > ob.x + ob.w || q.y < ob.y || q.y > ob.y + ob.h) continue; if (!pick && hitAlpha(o, q)) pick = o; const area = ob.w * ob.h; if (area < bestArea) { bestArea = area; best = o; } }
    const o = pick || best || l; if (!o) return false; if (o !== l) App.setActive(o);
    const pose = this.pose(o); this.drag = { k: 'move', p0: p, pose0: [pose.dx, pose.dy], par: this.parentWorld(o) }; return true; },
  parentWorld(l){ const par = l.part.parent && App.doc.layers.find(x => x.id === l.part.parent); return par ? this.world(par) : new DOMMatrix(); },
  pointerMove(p){ const g = this.drag, l = this.sel; if (!g || !l) return; const t = this.target(l).pose; const m = this.world(l);
    if (g.k === 'pivot') { const lp = m.inverse().transformPoint(new DOMPoint(p.x, p.y)); l.part.pivot = { x: lp.x, y: lp.y }; }
    else if (g.k === 'move') { const inv = g.par.inverse(); const a = inv.transformPoint(new DOMPoint(p.x, p.y)), b = inv.transformPoint(new DOMPoint(g.p0.x, g.p0.y)); const cur = this.pose(l); t.dx += (g.pose0[0] + a.x - b.x) - cur.dx; t.dy += (g.pose0[1] + a.y - b.y) - cur.dy; }
    else if (g.k === 'rot') { const a = Math.atan2(p.y - g.cen.y, p.x - g.cen.x); const cur = this.pose(l); t.rot += (g.rot0 + a - g.a0) - cur.rot; }
    else if (g.k === 'scale') { const k = Math.max(0.05, U.dist(p, g.cen) / g.d0); const cur = this.pose(l); t.sx *= (g.s0[0] * k) / cur.sx; t.sy *= (g.s0[1] * k) / cur.sy; }
    else if (g.k === 'lat') { const lp = m.inverse().transformPoint(new DOMPoint(p.x, p.y)); const n = l.part.lattice.pts.length; if (!t.lat) t.lat = new Array(n * 2).fill(0); t.lat[g.i * 2] += lp.x - g.p0.x; t.lat[g.i * 2 + 1] += lp.y - g.p0.y; g.p0 = { x: lp.x, y: lp.y }; }
    App.invalidate(); },
  pointerUp(){ if (this.drag) { const moved = this.drag.k !== 'pivot'; this.drag = null; this.refreshParams(); this.refresh(); App.dirty(); if (moved) { const t = this.target(this.sel); if (t.warn) App.toast('滑桿不在端點，剛才改的是基本姿勢'); } } },
  setKey(which){ const p = this.param(); if (!p) return; p.v = which === 'min' ? (p.min < 0 ? p.min : 0) : p.max; this.refreshParams(); App.invalidate(); },
  // ---- 動作晶片 ＋ 大滑桿 ----
  refreshParams(){ const box = $('#motionChips'); if (!box) return; const d = App.doc, l = this.sel; box.innerHTML = '';
    for (const p of d.params) { const b = document.createElement('button'); b.className = 'chip' + (p.id === this.editParam ? ' on' : ''); const lab = labelOf(p); b.textContent = lab[0] + (p.v ? ' ' + p.v.toFixed(1) : ''); b.onclick = () => { this.editParam = p.id; this.refreshParams(); }; b.oncontextmenu = async (e) => { e.preventDefault(); if (await App.confirm('刪除參數「' + p.name + '」？')) { d.params = d.params.filter(q => q !== p); for (const o of d.layers) delete o.part.keys[p.id]; delete d.anim.tracks[p.id]; this.editParam = (d.params[0] || {}).id; this.refreshParams(); App.invalidate(); App.dirty(); } }; box.appendChild(b); }
    const p = this.param(); const bs = $('#bigSlider'); if (!p) { bs.hidden = true; this.refreshParamRows(); return; } bs.hidden = false; bs.classList.toggle('onekey', p.min === 0);
    const t = (p.v - p.min) / (p.max - p.min); bs.querySelector('.knob').style.left = (t * 100) + '%';
    const keys = l ? (l.part.keys[p.id] || {}) : {}; bs.querySelector('.d0').classList.toggle('has', !!keys[p.min] && p.min < 0); bs.querySelector('.d2').classList.toggle('has', !!keys[p.max]); bs.querySelector('.d1').classList.toggle('has', false);
    const lab = labelOf(p); $('#rkMin').textContent = p.min < 0 ? '◀ ' + lab[1] : '○ 歸零'; $('#rkMax').textContent = lab[2] + ' ▶';
    const st = $('#rigStatus'); if (!l) st.textContent = '先點一個零件'; else if (p.v === 0) st.textContent = '基本姿勢（所有動作歸零）'; else if (p.v === p.min || p.v === p.max) st.textContent = '擺「' + (p.v === p.max ? lab[2] : lab[1]) + '」的姿勢：拖「' + l.name + '」'; else st.textContent = '預覽 ' + p.v.toFixed(2) + '（拉到端點才會記錄）';
    this.refreshParamRows(); },
  // Cubism 式參數面板：每個參數一條滑桿，滑桿上有關鍵點
  refreshParamRows(){ const box = $('#paramRows'); if (!box || $('#popParams').hidden) return; const d = App.doc, l = this.sel; box.innerHTML = '';
    for (const p of d.params) { const row = document.createElement('div'); row.className = 'prow' + (p.id === this.editParam ? ' on' : ''); const keys = l ? (l.part.keys[p.id] || {}) : {}; const ks = p.min < 0 ? [p.min, 0, p.max] : [0, p.max]; const pos = (v) => 6 + (v - p.min) / (p.max - p.min) * 100 + '%';
      row.innerHTML = `<span class="nm" title="${p.l2d || ''}">${p.name}</span><div class="ps"><div class="tr"></div>${ks.map(k => `<div class="kd ${k !== 0 && keys[k] ? 'has' : ''} ${k === 0 ? 'base' : ''}" data-k="${k}" style="left:calc(${(k - p.min) / (p.max - p.min) * 100}% * 0.94 + 6px)"></div>`).join('')}<div class="kn" style="left:calc(${(p.v - p.min) / (p.max - p.min) * 100}% * 0.94 + 6px)"></div></div><b>${p.v.toFixed(2)}</b>`; void pos;
      const ps = row.querySelector('.ps'); let on = false; const h = (e) => { const r = ps.getBoundingClientRect(); let t = U.clamp((e.clientX - r.left - 6) / (r.width - 12), 0, 1); const v = p.min + (p.max - p.min) * t; p.v = Math.round(v * 100) / 100; for (const k of ks) if (Math.abs(p.v - k) < 0.06) p.v = k; this.editParam = p.id; row.querySelector('.kn').style.left = `calc(${(p.v - p.min) / (p.max - p.min) * 100}% * 0.94 + 6px)`; row.querySelector('b').textContent = p.v.toFixed(2); App.invalidate(); };
      ps.addEventListener('pointerdown', (e) => { const kd = e.target.closest('.kd'); if (kd) { p.v = +kd.dataset.k; this.editParam = p.id; this.refreshParams(); App.invalidate(); return; } on = true; try { ps.setPointerCapture(e.pointerId); } catch (err) {} h(e); }); ps.addEventListener('pointermove', (e) => { if (on) h(e); }); ps.addEventListener('pointerup', () => { if (on) { on = false; this.refreshParams(); } });
      box.appendChild(row); } },
  // ---- 試玩（呼吸、眨眼、擺動＋跟著游標）----
  openParams(anchor){ App.openPop('popParams', anchor, { alignRight: true, keep: true }); this.refreshParamRows(); },
  startTry(){ this.trying = true; $('#rgTry').classList.add('on'); $('#rgTry').textContent = '■ 停止'; this.saved = App.doc.params.map(p => p.v); App.hint('移動游標／手指，頭會跟著看；再按一次停止'); this.play(true); },
  stopTry(){ if (!this.trying) return; this.trying = false; $('#rgTry').classList.remove('on'); $('#rgTry').textContent = '▶ 試玩'; this.stop(); if (this.saved) App.doc.params.forEach((p, i) => p.v = this.saved[i]); this.refreshParams(); App.invalidate(); },
  // ---- 時間軸 ----
  refreshKeys(){ const d = App.doc, box = $('#rigKeys'); if (!box) return; $('#rgDur').value = d.anim.duration; $('#rgTime').value = Math.round(this.time / d.anim.duration * 1000); $('#rgTimeLbl').textContent = this.time.toFixed(2) + 's';
    const times = new Set(); for (const pid in d.anim.tracks) for (const k of d.anim.tracks[pid]) times.add(+k.t.toFixed(2)); box.innerHTML = [...times].map(t => `<div class="k ${Math.abs(t - this.time) < 0.02 ? 'on' : ''}" style="left:${t / d.anim.duration * 100}%" data-t="${t}"></div>`).join('') + `<div class="cur" style="left:${this.time / d.anim.duration * 100}%"></div>`;
    box.querySelectorAll('.k').forEach(k => k.onclick = () => { this.time = +k.dataset.t; this.applyTracks(); this.refreshKeys(); this.refreshParams(); App.invalidate(); }); },
  trackValue(pid, t){ const tr = App.doc.anim.tracks[pid]; if (!tr || !tr.length) return null; if (t <= tr[0].t) return tr[0].v; if (t >= tr[tr.length - 1].t) return tr[tr.length - 1].v; for (let i = 0; i < tr.length - 1; i++) if (t >= tr[i].t && t <= tr[i + 1].t) { let k = (t - tr[i].t) / Math.max(1e-6, tr[i + 1].t - tr[i].t); k = k * k * (3 - 2 * k); return U.lerp(tr[i].v, tr[i + 1].v, k); } return null; },
  applyTracks(){ for (const p of App.doc.params) { const v = this.trackValue(p.id, this.time); if (v != null) p.v = U.clamp(v, p.min, p.max); } },
  idleValues(t, out){ const d = App.doc; const set = (id, v) => { const p = d.params.find(p => p.id === id); if (p) out[id] = U.clamp(v, p.min, p.max); }; set('breath', 0.5 + 0.5 * Math.sin(t * 2.2)); const bl = t % 3.3; set('blink', bl > 3.0 ? Math.sin((bl - 3.0) / 0.3 * Math.PI) : 0); set('angX', Math.sin(t * 0.7) * 0.5); set('angY', Math.sin(t * 0.9 + 1) * 0.3); set('bodyX', Math.sin(t * 0.5) * 0.4); return out; },
  play(withIdle){ this.playing = true; $('#rgPlay').textContent = '■'; let last = performance.now(); const step = (now) => { if (!this.playing) return; const dt = (now - last) / 1000; last = now; const d = App.doc; this.time = (this.time + dt) % d.anim.duration; this.applyTracks();
      if (withIdle || this.trying) { const v = this.idleValues(now / 1000, {}); for (const id in v) { const p = d.params.find(p => p.id === id); if (p && !(d.anim.tracks[id] || []).length) p.v = v[id]; }
        if (this.trying && App.cursor) { const d2 = App.screenToDoc(App.cursor); const set = (id, v) => { const p = d.params.find(p => p.id === id); if (p) p.v = U.clamp(v, p.min, p.max); }; set('angX', (d2.x / d.w - 0.5) * 2.4); set('angY', -(d2.y / d.h - 0.5) * 2.4); } }
      if (!$('#rigTimeline').hidden) this.refreshKeys(); App.invalidate(); requestAnimationFrame(step); }; requestAnimationFrame(step); },
  stop(){ this.playing = false; $('#rgPlay').textContent = '▶'; },
  async record(){ const d = App.doc; const c = U.mkCanvas(d.w, d.h); const stream = c.captureStream(30); const rec = new MediaRecorder(stream, { mimeType: 'video/webm' }); const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
    const done = new Promise(r => rec.onstop = r); rec.start(); const was = this.playing; this.stop(); const fps = 30, n = Math.round(d.anim.duration * fps); App.toast('錄影中…');
    for (let i = 0; i < n; i++) { this.time = i / fps; this.applyTracks(); const v = this.idleValues(i / fps, {}); for (const id in v) { const p = d.params.find(p => p.id === id); if (p && !(d.anim.tracks[id] || []).length) p.v = v[id]; } this.render(d, c); await new Promise(r => setTimeout(r, 1000 / fps)); }
    rec.stop(); await done; const blob = new Blob(chunks, { type: 'video/webm' }); App.saveFile((d.name || 'rig') + '.webm', blob); if (was) this.play(); },
  exportData(){ const d = App.doc; const parts = d.layers.map((l, i) => { const b = this.bounds(l); const P = l.part; return { name: l.name, file: 'parts/' + safe(l.name) + '.png', order: i, visible: l.visible, opacity: l.opacity, blend: l.blend, bbox: b, pivot: this.pivot(l), parent: P.parent ? (d.layers.find(x => x.id === P.parent) || {}).name || null : null, grid: P.grid || 0, lattice: P.lattice ? P.lattice.pts : null, base: P.base, keys: P.keys }; });
    return { format: 'somnia-rig', version: 1, canvas: { w: d.w, h: d.h }, params: d.params.map(p => ({ id: p.id, name: p.name, min: p.min, max: p.max, live2dId: p.l2d || null, live2dRange: p.range || null, live2dInvert: !!p.invert })), animation: d.anim, parts, note: '座標為畫布像素，y 向下。pose: dx,dy 平移、rot 弧度、sx,sy 縮放、lat 網格點位移 [x0,y0,x1,y1…]。keys[paramId][keyValue] 是該參數在關鍵值時的差量，依參數值線性插值後相加（縮放相乘）。' }; },
};
function safe(s){ return String(s).replace(/[^\w一-鿿-]+/g, '_'); }
function grid(ctx, n, pts){ ctx.beginPath(); for (let r = 0; r <= n; r++) { for (let c = 0; c <= n; c++) { const p = pts[r * (n + 1) + c]; c ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } } for (let c = 0; c <= n; c++) { for (let r = 0; r <= n; r++) { const p = pts[r * (n + 1) + c]; r ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } } ctx.stroke(); }
function tri(ctx, img, s0, s1, s2, d0, d1, d2){
  const u1x = s1.x - s0.x, u1y = s1.y - s0.y, u2x = s2.x - s0.x, u2y = s2.y - s0.y; const det = u1x * u2y - u2x * u1y; if (Math.abs(det) < 1e-6) return;
  const v1x = d1.x - d0.x, v1y = d1.y - d0.y, v2x = d2.x - d0.x, v2y = d2.y - d0.y;
  const a = (v1x * u2y - v2x * u1y) / det, c = (v2x * u1x - v1x * u2x) / det, b = (v1y * u2y - v2y * u1y) / det, d = (v2y * u1x - v1y * u2x) / det; const e = d0.x - a * s0.x - c * s0.y, f = d0.y - b * s0.x - d * s0.y;
  const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3; const ex = (p) => { const dx = p.x - cx, dy = p.y - cy, L = Math.hypot(dx, dy) || 1; return { x: p.x + dx / L * 0.7, y: p.y + dy / L * 0.7 }; }; const e0 = ex(d0), e1 = ex(d1), e2 = ex(d2);
  ctx.save(); ctx.beginPath(); ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.closePath(); ctx.clip(); ctx.transform(a, b, c, d, e, f); ctx.drawImage(img, 0, 0); ctx.restore();
}
})();
