'use strict';
// ======================================================================
//  夢偶 Live（第二段）：匯入 .procreate／PSD／ZIP／PNG → 零件，自動認角色、自動骨架、零件面板、存檔、匯出
// ======================================================================
(function(){
const App = Studio.app, U = Studio.util, Doc = Studio.Doc, Layer = Studio.Layer, Ser = Studio.ser, Store = Studio.store, R = Studio.rig;
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
Studio.anim = Studio.anim || { refresh(){}, playing: false, stop(){} };

// ---------------- 載入文件 ----------------
App.loadDoc = (doc, src) => { App.doc = doc; App.history.clear(); App.composite = U.mkCanvas(doc.w, doc.h); for (const l of doc.layers) l.part._bb = null; $('#docName').textContent = doc.name; $('#docName').classList.remove('dim'); $('#drop').hidden = true; document.title = doc.name + ' · 夢偶'; try { localStorage.setItem('somnia-live-last', doc.id); } catch (e) {}
  doc.activeId = (doc.layers.find(l => R.kind(l) === 'head') || doc.layers[doc.layers.length - 1] || {}).id; App.fit(); R.enter(); App.refreshLayers(); App.invalidate(); if (src) App.toast(src); };
App.setActive = (l) => { App.doc.activeId = l.id; R.select(l); App.refreshLayers(); App.invalidate(); };
function docFromLayers(info){ const d = new Doc(info.w, info.h, info.name); for (const L of info.layers) { const l = new Layer(d, L.name || '圖層'); l.cels[0].getContext('2d').drawImage(L.canvas, 0, 0); l.visible = !L.hidden; l.opacity = L.opacity == null ? 1 : L.opacity; l.clip = !!L.clipped; if (L.role) l.part.role = L.role; d.layers.push(l); } d.activeId = (d.layers[d.layers.length - 1] || {}).id; return d; }

// ---------------- 匯入 ----------------
async function importFile(file){ const name = file.name.toLowerCase(); App.setProgress(0.05);
  try {
    if (name.endsWith('.procreate')) { const info = await Procreate.load(file, p => App.setProgress(0.1 + p * 0.8)); finishImport(docFromLayers(info), `.procreate：${info.layers.length} 層，方向校正：${info.transform}`); }
    else if (name.endsWith('.psd') || name.endsWith('.psb')) { const psd = agPsd.readPsd(await file.arrayBuffer(), { skipThumbnail: true, skipLinkedFilesData: true }); const layers = []; const walk = (nodes, prefix) => { for (const n of nodes) { if (n.children) { walk(n.children, (prefix ? prefix + '/' : '') + (n.name || '')); continue; } if (!n.canvas) continue; const cv = U.mkCanvas(psd.width, psd.height); cv.getContext('2d').drawImage(n.canvas, n.left || 0, n.top || 0); layers.push({ name: (prefix ? prefix + '/' : '') + (n.name || '圖層'), canvas: cv, hidden: !!n.hidden, opacity: n.opacity == null ? 1 : n.opacity, clipped: !!n.clipping }); } }; walk(psd.children || [], ''); if (!layers.length && psd.canvas) layers.push({ name: '圖層', canvas: psd.canvas, hidden: false, opacity: 1 }); finishImport(docFromLayers({ w: psd.width, h: psd.height, name: file.name.replace(/\.psd$/i, ''), layers }), `PSD：${layers.length} 層`); }
    else if (name.endsWith('.zip')) { const zip = await JSZip.loadAsync(file); if (zip.file('project.json')) { const meta = JSON.parse(await zip.file('project.json').async('string')); const blobs = {}; for (const f of Object.keys(zip.files)) if (f.startsWith('cels/') && f.endsWith('.png')) blobs[f.slice(5, -4)] = await zip.file(f).async('blob'); const doc = await Ser.unpack(meta, blobs); doc.id = U.uid(); finishImport(doc, '夢境畫室專案'); }
      else if (zip.file('layers.json')) { const meta = JSON.parse(await zip.file('layers.json').async('string')); const layers = []; for (const L of meta.layers) { const b = await zip.file(L.file).async('blob'); const im = await U.loadImage(URL.createObjectURL(b)); const cv = U.mkCanvas(meta.w, meta.h); cv.getContext('2d').drawImage(im, 0, 0); layers.push({ name: L.name, canvas: cv, hidden: L.visible === false, opacity: L.opacity, clipped: L.clip }); } finishImport(docFromLayers({ w: meta.w, h: meta.h, name: meta.name || file.name, layers }), `ZIP：${layers.length} 層`); }
      else throw new Error('這個 ZIP 裡沒有 project.json 或 layers.json'); }
    else if (name.endsWith('.png') || file.type === 'image/png') { const im = await U.loadImage(URL.createObjectURL(file)); const cv = U.mkCanvas(im.width, im.height); cv.getContext('2d').drawImage(im, 0, 0); finishImport(docFromLayers({ w: im.width, h: im.height, name: file.name.replace(/\.png$/i, ''), layers: [{ name: 'body', canvas: cv }] }), '單張 PNG（只有一個零件，只能整個動）'); }
    else throw new Error('不認得的檔案：' + file.name);
  } catch (e) { console.error(e); App.toast('讀取失敗：' + (e.message || e)); } App.setProgress(1); }
function finishImport(doc, msg){ for (const l of doc.layers) { l.part._bb = null; if (!l.part.role) { const k = R.kind(l); if (k !== 'other') l.part.role = k; } } App.loadDoc(doc, msg); R.autoParent();
  const known = doc.layers.filter(l => R.kind(l) !== 'other'); if (known.length) { R.autoRig(); R.refresh(); R.refreshParams(); App.refreshLayers(); App.invalidate(); App.dirty(); setTimeout(() => { R.startTry(); App.toast(`認出 ${known.length} 個零件，已自動做好骨架，動動游標看看`); }, 300); }
  else App.modal(`<h2>圖層都認不出來</h2><div class="dim" style="line-height:1.7">圖層名稱是：${doc.layers.map(l => l.name).join('、')}<br><br>在左邊「零件」清單，把每一層的「角色」選好（頭、眼睛、嘴、前髮、身體、手臂…），再按上面「⚙ 自動骨架」。<br>下次在 Procreate 裡直接把圖層取名「頭」「左眼」「嘴」「前髮」「身體」「左手」就會自動認。</div><div class="btns"><button class="sm pri" onclick="Studio.app.closeModal()">好</button></div>`); }
$('#fileIn').onchange = (e) => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; };
$('#btnOpen').onclick = () => $('#fileIn').click(); $('#btnOpen2').onclick = () => $('#fileIn').click();
const dz = $('#stage'); dz.addEventListener('dragover', (e) => { e.preventDefault(); $('#drop').classList.add('over'); }); dz.addEventListener('dragleave', () => $('#drop').classList.remove('over')); dz.addEventListener('drop', (e) => { e.preventDefault(); $('#drop').classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) importFile(f); });

// ---------------- 零件面板 ----------------
App.refreshLayers = () => { const d = App.doc; if (!d) return; const box = $('#parts'); box.innerHTML = ''; const kinds = R.KINDS;
  [...d.layers].reverse().forEach(l => { const row = document.createElement('div'); row.className = 'part' + (l.id === d.activeId ? ' on' : ''); const th = document.createElement('canvas'); th.width = th.height = 44; const tx = th.getContext('2d'); const s = 44 / Math.max(d.w, d.h); tx.drawImage(l.canvas(0), 0, 0, d.w * s, d.h * s); row.appendChild(th);
    const par = l.part.parent && d.layers.find(x => x.id === l.part.parent); const nm = document.createElement('div'); nm.className = 'nm'; nm.innerHTML = `${l.name}<div class="meta">${par ? '↳ ' + par.name : ''}${Object.keys(l.part.keys).length ? ' · ' + Object.keys(l.part.keys).length + ' 個動作' : ''}</div>`; row.appendChild(nm);
    const sel = document.createElement('select'); sel.innerHTML = kinds.map(k => `<option value="${k[0]}" ${R.kind(l) === k[0] ? 'selected' : ''}>${k[1]}</option>`).join(''); sel.onchange = (e) => { l.part.role = e.target.value; App.refreshLayers(); App.dirty(); }; sel.onclick = (e) => e.stopPropagation(); row.appendChild(sel);
    const eye = document.createElement('button'); eye.className = 'eye' + (l.visible ? ' on' : ''); eye.textContent = '✓'; eye.onclick = (e) => { e.stopPropagation(); l.visible = !l.visible; App.refreshLayers(); App.invalidate(); App.dirty(); }; row.appendChild(eye);
    row.onclick = () => App.setActive(l); box.appendChild(row); });
  const a = d.active; const role = $('#rgRole'); role.innerHTML = kinds.map(k => `<option value="${k[0]}" ${a && R.kind(a) === k[0] ? 'selected' : ''}>${k[1]}</option>`).join(''); role.onchange = (e) => { if (a) { a.part.role = e.target.value; App.refreshLayers(); App.dirty(); } };
  R.sel = a; R.refresh(); R.refreshParams(); };
$('#btnAutoRig').onclick = async () => { const d = App.doc; if (!d) return; const known = d.layers.filter(l => R.kind(l) !== 'other'); if (!known.length) { App.toast('先在左邊把零件的角色選好'); return; } if (!(await App.confirm(`會動的零件：${known.map(l => l.name).join('、')}\n要依角色自動做頭轉、呼吸、眨眼、嘴開合嗎？會覆蓋這些動作現有的姿勢。`))) return; R.autoParent(); R.autoRig(); R.refresh(); R.refreshParams(); App.refreshLayers(); App.invalidate(); App.dirty(); R.startTry(); };
$('#btnLeft').onclick = () => { $('#left').classList.toggle('open'); $('#right').classList.remove('open'); }; $('#btnRight').onclick = () => { $('#right').classList.toggle('open'); $('#left').classList.remove('open'); };

// ---------------- 存檔／圖庫／匯出 ----------------
App.saveLocal = async (silent) => { const d = App.doc; if (!d) return; try { const { meta, blobs } = await Ser.pack(d); await Store.put({ id: d.id, name: d.name, updated: Date.now(), thumb: Ser.thumb(d, 160), w: d.w, h: d.h, meta, blobs, app: 'live' }); if (!silent) App.toast('已存在這個瀏覽器'); } catch (e) { console.error(e); if (!silent) App.toast('存檔失敗：' + e.message); } };
$('#btnSave').onclick = () => App.saveLocal();
$('#btnGallery').onclick = async () => { const list = (await Store.list()).sort((a, b) => b.updated - a.updated); const b = App.modal(`<h2>圖庫</h2><div class="list">${list.map(p => `<div class="it" data-id="${p.id}"><img src="${p.thumb || ''}" style="width:56px;height:56px;object-fit:contain;border-radius:6px;background:#333"><div class="nm">${p.name}<div class="meta">${p.w}×${p.h} · ${new Date(p.updated).toLocaleString()}</div></div><button class="sm del">✕</button></div>`).join('') || '<div class="dim">還沒有存過</div>'}</div><div class="btns"><button class="sm" onclick="Studio.app.closeModal()">關閉</button></div>`);
  b.querySelectorAll('.it').forEach(it => { it.onclick = async () => { App.closeModal(); const rec = await Store.get(it.dataset.id); if (!rec) return; const doc = await Ser.unpack(rec.meta, rec.blobs); App.loadDoc(doc, '已開啟'); }; it.querySelector('.del').onclick = async (e) => { e.stopPropagation(); if (await App.confirm('刪除這個？')) { await Store.del(it.dataset.id); $('#btnGallery').click(); } }; }); };
$('#btnExport').onclick = async () => { const d = App.doc; if (!d) return; App.toast('打包中…'); const zip = new JSZip(); const data = R.exportData(); d.layers.forEach((l, i) => { const b = data.parts[i].bbox; const c = U.mkCanvas(b.w, b.h); c.getContext('2d').drawImage(l.canvas(0), -b.x, -b.y); zip.file(data.parts[i].file, U.toBlob(c)); }); zip.file('rig.json', JSON.stringify(data, null, 1)); const { meta, blobs } = await Ser.pack(d); zip.file('project/project.json', JSON.stringify(meta)); for (const k in blobs) zip.file('project/cels/' + k + '.png', blobs[k]); App.saveFile((d.name || 'rig').replace(/[\\/:*?"<>|]+/g, '_') + '_rig.zip', await zip.generateAsync({ type: 'blob' })); };
$('#btnHelp').onclick = () => App.modal(`<h2>夢偶 Live 怎麼用</h2><pre>1. 在 Procreate 裡畫的時候就分好圖層，名字寫「頭」「左眼」「右眼」「嘴」「前髮」「後髮」「身體」「左手」「右手」「披風」（英文 head / eye_L / mouth / hair_front / body / arm_L 也行）
2. 把 .procreate 直接丟進來（或分享成 PSD 再丟）。圖層＝零件，名字對了就自動認出來、自動做好骨架、直接動
3. 沒認出來的，在左邊「零件」把角色選一下，再按「⚙ 自動骨架」
4. 想自己調：下面選一個動作（角度X＝頭左右看），把滑桿拉到一端，然後
   ・拖零件＝移動　角落＝縮放　上面的圓＝旋轉
   ・零件自動有網格，拖網格點＝變形（像 Cubism 的彎曲變形器）
   拉回中間就會在兩個姿勢之間動。右邊「參數」是 Cubism 式的全部滑桿，⊕2／⊕3 把零件登記到參數上
5. 「▶ 試玩」：呼吸、眨眼、頭跟著游標。「● 錄影」存成 WebM。「匯出」：零件 PNG＋rig.json＋專案
手勢：一指拖零件或平移，兩指縮放旋轉，滾輪縮放，0 置中</pre><div class="btns"><button class="sm pri" onclick="Studio.app.closeModal()">好</button></div>`);
// 把 rig.js 的說明卡換成我們自己的
const rh = $('#rigHelp'); if (rh) rh.hidden = true;

// ---------------- 啟動 ----------------
(async function start(){ try { localStorage.setItem('somnia-righelp', '1'); } catch (e) {} R.init(); try { const last = localStorage.getItem('somnia-live-last'); if (last) { const rec = await Store.get(last); if (rec) { App.loadDoc(await Ser.unpack(rec.meta, rec.blobs), '上次的檔案'); } } } catch (e) { console.error(e); } })();
})();
