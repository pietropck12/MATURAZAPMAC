'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, session } = require('electron');

class WhatsAppService {
  constructor(license) {
    this.license = license;
    this.windows = new Map();
    this.wppScript = fs.readFileSync(path.join(__dirname, '..', 'assets', 'wppconnect-wa.js'), 'utf8');
  }

  async open(account) {
    this.license.isAccountAllowed(account.number);
    const current = this.windows.get(account.id);
    if (current && !current.isDestroyed()) { current.show(); current.focus(); return; }
    const partition = `persist:maturazap-${account.id}`;
    const accountSession = session.fromPartition(partition);
    if (account.proxy) await accountSession.setProxy({ proxyRules: account.proxy });
    const window = new BrowserWindow({
      width: 1180, height: 820, minWidth: 860, minHeight: 640,
      title: `${account.nickname} · Matura Zap`,
      backgroundColor: '#0b1713',
      webPreferences: { partition, nodeIntegration: false, contextIsolation: true, sandbox: true }
    });
    this.windows.set(account.id, window);
    window.on('closed', () => this.windows.delete(account.id));
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      const host = new URL(url).hostname;
      if (host !== 'web.whatsapp.com' && !host.endsWith('.whatsapp.com')) event.preventDefault();
    });
    accountSession.setPermissionRequestHandler((_contents, permission, callback) => callback(['media', 'notifications'].includes(permission)));
    window.webContents.on('did-finish-load', () => this.inject(account.id).catch(() => {}));
    await window.loadURL('https://web.whatsapp.com/', { userAgent: window.webContents.getUserAgent().replace(/Electron\/[\d.]+\s*/i, '') });
  }

  async inject(id) {
    const account = this.accountWindow(id);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ready = await account.webContents.executeJavaScript('Boolean(window.WPP && window.WPP.isReady)').catch(() => false);
      if (ready) return true;
      await account.webContents.executeJavaScript(`window.WPPConfig={disableGoogleAnalytics:true,linkPreviewApiServers:[]};\n${this.wppScript}`, true).catch(() => false);
      for (let check = 0; check < 18; check += 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (await account.webContents.executeJavaScript('Boolean(window.WPP && window.WPP.isReady)').catch(() => false)) return true;
      }
    }
    return false;
  }

  accountWindow(id) {
    const window = this.windows.get(id);
    if (!window || window.isDestroyed()) throw new Error('Abra e conecte esta conta antes de iniciar.');
    return window;
  }

  async status(account) {
    const window = this.windows.get(account.id);
    if (!window || window.isDestroyed()) return { open: false, connected: false };
    const connected = await window.webContents.executeJavaScript('Boolean(window.WPP && WPP.conn && WPP.conn.isAuthenticated())').catch(() => false);
    return { open: true, connected };
  }

  async currentNumber(account) {
    const window = this.accountWindow(account.id);
    const result = await window.webContents.executeJavaScript('window.WPP && WPP.conn ? WPP.conn.getMyUserId() : null').catch(() => null);
    return String(result?.user || '').replace(/\D/g, '');
  }

  async send(source, destination, message) {
    this.license.isAccountAllowed(source.number);
    this.license.isAccountAllowed(destination.number);
    const window = this.accountWindow(source.id);
    const actual = await this.currentNumber(source);
    if (!actual || (actual !== source.number && !actual.endsWith(source.number.slice(-11)))) {
      throw new Error(`O WhatsApp aberto em ${source.nickname} não corresponde ao número cadastrado.`);
    }
    const target = `${destination.number}@c.us`;
    const script = `(async()=>{try{const contact=await WPP.contact.queryWidExists(${JSON.stringify(target)});if(!contact||!contact.wid)return false;await WPP.chat.sendTextMessage(contact.wid,${JSON.stringify(message)},{createChat:true,linkPreview:false});return true}catch{return false}})()`;
    return Boolean(await window.webContents.executeJavaScript(script));
  }

  close(id) {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) window.close();
  }
}

module.exports = { WhatsAppService };

