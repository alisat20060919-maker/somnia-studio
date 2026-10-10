'use strict';
// ======================================================================
//  逐格動畫：時間軸、畫格、播放、洋蔥皮、Sprite Sheet
// ======================================================================
(function(){
const App = Studio.app, U = Studio.util, Comp = Studio.comp;
const $ = (s) => document.querySelector(s);
const Anim = Studio.anim = {
  playing: false, timer: null,
  init(){
    $('#tlPlay').onclick = () => this.toggle();
    $('#tlFps').oninput = (e) => { App.doc.fps = U.clamp(+e.target.value || 8, 1, 60); e.target.nextElementSibling.textContent = App.doc.fps; if (this.playing) { this.stop(); this.play(); } App.dirty(); };
    $('#tlOnion').onchange = (e) => { App.doc.onion = e.target.checked; App.invalidate(); };
    $('#tlNewCel').onclick = () => this.newCel(false);
    $('#tlDupCel').onclick = () => this.newCel(true);
    $('#tlSettings').onclick = (e) => App.openPop('popAnimSet', e.target);
    document.querySelectorAll('#popAnimSet [data-anim]').forEach(b => b.onclick = () => { App.closePopups(); this.action(b.dataset.anim); });
  },
  action(k){ const d = App.doc;
    if (k === 'addFrame') { d.frames++; this.go(d.frames - 1); App.dirty(); }
    else if (k === 'delFrame') { if (d.frames <= 1) return; d.frames--; for (const l of d.layers) delete l.cels[d.frames]; if (d.frame >= d.frames) this.go(d.frames - 1); this.refresh(); App.dirty(); }
    else if (k === 'delCel') { const l = d.active; if (!l || !l.animated || d.frame === 0 || !l.cels[d.frame]) { App.toast('這一格沒有自己的畫面'); return; } const old = l.cels[d.frame]; const f = d.frame; App.history.push({ undo: () => { l.cels[f] = old; App.invalidate(); this.refresh(); }, redo: () => { delete l.cels[f]; App.invalidate(); this.refresh(); } }); delete l.cels[f]; l.thumbDirty = true; this.refresh(); App.invalidate(); App.dirty(); } },
  // 新增影格：在最後加一格並給目前圖層一個畫格（空白或複製上一格）
  newCel(copy){ const d = App.doc, l = d.active; if (!l) return; if (l.locked) { App.toast('圖層已鎖定'); return; } if (!l.animated) { l.animated = true; App.refreshLayers(); App.toast('「' + l.name + '」已設為動畫圖層'); }
    let f = d.frame; if (l.cels[f]) { d.frames = Math.max(d.frames, f + 2); f = f + 1; d.frame = f; }
    const old = l.cels[f]; const c = copy ? U.cloneCanvas(l.canvas(f)) : U.mkCanvas(d.w, d.h); l.cels[f] = c; const frames0 = d.frames;
    App.history.push({ undo: () => { if (old) l.cels[f] = old; else delete l.cels[f]; d.frames = frames0; App.invalidate(); this.refresh(); }, redo: () => { l.cels[f] = c; App.invalidate(); this.refresh(); } });
    l.thumbDirty = true; this.refresh(); App.invalidate(); App.dirty(); },
  go(f){ const d = App.doc; d.frame = U.clamp(f, 0, d.frames - 1); if (App.tool === 'move' && Studio.tools.move.fl) Studio.tools.move.apply(); this.refresh(); App.invalidate(); App.refreshLayers(); },
  toggle(){ this.playing ? this.stop() : this.play(); },
  play(){ this.playing = true; $('#tlPlay').textContent = '■'; const step = () => { const d = App.doc; d.frame = (d.frame + 1) % d.frames; this.refresh(); App.invalidate(); }; this.timer = setInterval(step, 1000 / App.doc.fps); },
  stop(){ this.playing = false; $('#tlPlay').textContent = '▶'; clearInterval(this.timer); this.timer = null; },
  refresh(){
    const d = App.doc, box = $('#frames'); if (!box || App.mode !== 'anim') return; $('#tlFps').value = d.fps; $('#tlFps').nextElementSibling.textContent = d.fps; $('#tlOnion').checked = d.onion;
    const l = d.active; box.innerHTML = ''; const t = U.mkCanvas(d.w, d.h); const s = 54 / Math.max(d.w, d.h);
    for (let i = 0; i < d.frames; i++) { const has = l && l.animated && l.cels[i]; const hold = l && l.animated && !l.cels[i] && i > 0; const el = document.createElement('div'); el.className = `frame ${i === d.frame ? 'on' : ''} ${has ? 'cel' : hold ? 'hold' : ''}`; const c = U.mkCanvas(Math.max(1, d.w * s), Math.max(1, d.h * s)); Comp.render(d, t, { frame: i }); c.getContext('2d').drawImage(t, 0, 0, c.width, c.height); el.appendChild(c); const sp = document.createElement('span'); sp.textContent = i + 1; el.appendChild(sp); el.onclick = () => this.go(i); box.appendChild(el); }
    const on = box.querySelector('.frame.on'); if (on) on.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  },
  // 所有影格排成 sprite sheet（自動換行）
  sheet(){ const d = App.doc, n = d.frames; const cols = Math.min(n, Math.max(1, Math.floor(8192 / d.w))); const rows = Math.ceil(n / cols); const c = U.mkCanvas(d.w * cols, d.h * rows), x = c.getContext('2d'); const t = U.mkCanvas(d.w, d.h);
    for (let i = 0; i < n; i++) { Comp.render(d, t, { frame: i }); x.drawImage(t, (i % cols) * d.w, Math.floor(i / cols) * d.h); }
    return { canvas: c, cols, rows, n }; },
};
})();
