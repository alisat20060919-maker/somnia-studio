'use strict';
// 夢偶 Live 桌面版：就是把 live/index.html 包成一個視窗
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
function create(){
  const win = new BrowserWindow({ width: 1400, height: 900, minWidth: 900, minHeight: 600, backgroundColor: '#141229', title: '夢偶 Live', autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true } });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '檔案', submenu: [{ label: '重新整理', role: 'reload' }, { label: '全螢幕', role: 'togglefullscreen' }, { type: 'separator' }, { label: '開發者工具', role: 'toggleDevTools' }, { type: 'separator' }, { label: '離開', role: 'quit' }] },
    { label: '畫室', submenu: [{ label: '開啟夢境畫室（繪圖）', click: () => { const w = new BrowserWindow({ width: 1400, height: 900, backgroundColor: '#141229', autoHideMenuBar: true }); w.loadFile(path.join(__dirname, '..', 'index.html')); } }] },
  ]));
  win.loadFile(path.join(__dirname, '..', 'live', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
