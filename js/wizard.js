'use strict';
// ======================================================================
//  「動起來」精靈：一步一步叫你圈零件，圈完自動切圖層、自動骨架、直接試玩。
//  不用懂零件、參數、關鍵形。
// ======================================================================
(function(){
const App = Studio.app, U = Studio.util;
const $ = (s) => document.querySelector(s);
// 順序很重要：先切眼睛嘴巴（在頭裡面），再切頭，最後剩下的就是身體
const STEPS = [
  { n: 'eye_L', q: '用筆把「左眼」圈起來（畫面左邊那隻，眼睛整顆連睫毛）' },
  { n: 'eye_R', q: '再圈「右眼」' },
  { n: 'mouth_normal', q: '圈「嘴巴」' },
  { n: 'hair_front', q: '圈「瀏海／前髮」（沒有就按略過）', opt: true },
  { n: 'head', q: '把「整個頭」圈起來（臉、頭髮、頭上的東西都算）' },
  { n: 'arm_L', q: '圈「左手臂」（沒有就略過）', opt: true },
  { n: 'arm_R', q: '圈「右手臂」（沒有就略過）', opt: true },
  { n: 'cloth', q: '圈會飄的東西：披風、裙擺、尾巴（沒有就略過）', opt: true },
  { n: 'weapon', q: '圈「武器／道具」（沒有就略過）', opt: true },
];
const Wiz = Studio.wizard = {
  on: false, i: 0, src: null,
  offer(){ App.modal(`<h2>要讓這張圖動起來嗎？</h2><div class="dim" style="line-height:1.7">我會一步一步告訴你圈哪裡（眼睛、嘴、頭、手…），圈好就自動切成零件、自動做好會轉頭、呼吸、眨眼的骨架，最後直接看它動。<br>不用懂任何設定，大概 3～5 分鐘。</div><div class="btns"><button class="sm" id="wzNo">我自己來</button><button class="sm pri" id="wzGo">開始</button></div>`); $('#wzNo').onclick = App.closeModal; $('#wzGo').onclick = () => { App.closeModal(); this.start(); }; },
  start(){ const d = App.doc; const src = d.active && d.active.visible && U.alphaBounds(d.active.canvas(0)) ? d.active : [...d.layers].reverse().find(l => l.visible && U.alphaBounds(l.canvas(0))); if (!src) { App.toast('這張圖是空的'); return; }
    this.on = true; this.i = 0; this.src = src; this.names = []; App.setMode('paint'); App.setActive(src); App.sel = null; App.setTool('lasso'); $('#barSelect').hidden = true; this.show(); },
  show(){ const bar = $('#wizBar'); bar.hidden = false; const s = STEPS[this.i]; if (!s) return this.finish();
    bar.innerHTML = `<div class="wzq"><b>${this.i + 1}／${STEPS.length}</b>　${s.q}</div><div class="wzb">${App.sel ? '<button class="chip" id="wzRedo">重圈</button><button class="chip pri" id="wzOk">✓ 就是這樣</button>' : (s.opt ? '<button class="chip" id="wzSkip">略過</button>' : '')}<button class="chip" id="wzQuit">結束</button></div>`;
    const ok = $('#wzOk'); if (ok) ok.onclick = () => this.accept(); const re = $('#wzRedo'); if (re) re.onclick = () => { App.sel = null; App.invalidate(); this.show(); }; const sk = $('#wzSkip'); if (sk) sk.onclick = () => { this.i++; this.show(); }; $('#wzQuit').onclick = () => this.stop();
    App.hint(App.sel ? '圈好了就按「✓ 就是這樣」，不滿意按「重圈」' : '在畫面上把它圈起來，放開筆就好'); },
  onSelect(){ if (this.on) this.show(); },
  accept(){ const s = STEPS[this.i]; if (!App.sel) return; App.doc.activeId = this.src.id; App.cutToLayer(s.n, true); this.names.push(s.n); App.doc.activeId = this.src.id; App.refreshLayers(); this.i++; this.show(); },
  finish(){ const d = App.doc, R = Studio.rig; $('#wizBar').hidden = true; this.on = false; App.sel = null;
    if (R.kind(this.src) === 'other') { this.src.name = 'body'; } // 剩下的線稿＝身體
    R.autoParent(); R.autoRig(); App.refreshLayers(); App.setMode('rig'); App.setActive(d.layers.find(l => l.name === 'head') || this.src); R.refresh(); R.refreshParams(); setTimeout(() => { R.startTry(); App.modal(`<h2>動起來了！</h2><div class="dim" style="line-height:1.7">現在移動手指或滑鼠，頭會跟著看，會呼吸、眨眼。<br><br>想調整：<br>・頂欄「參數」可以拉每一個動作看效果<br>・覺得某個零件動太多／太少：下面選那個動作，把滑桿拉到一端，直接拖那個零件到你要的位置<br>・「零件」裡可以改父子關係和網格變形<br>・再按一次「■ 停止」就回到編輯</div><div class="btns"><button class="sm pri" onclick="Studio.app.closeModal()">好</button></div>`); }, 100); App.dirty(); },
  stop(){ this.on = false; $('#wizBar').hidden = true; App.sel = null; $('#barSelect').hidden = !(App.tool === 'select' || App.tool === 'lasso'); App.invalidate(); App.toast('已結束精靈，切好的零件都還在'); },
};
$('#btnWizard').onclick = () => Wiz.offer();
$('#btnWizard2').onclick = () => Wiz.offer();
})();
