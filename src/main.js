'use strict';

const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { LicenseService } = require('./license-service');
const { AccountService } = require('./account-service');
const { WhatsAppService } = require('./whatsapp');

let mainWindow;
let license;
let accounts;
let whatsapp;
let warmController;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 680,
    title: 'Matura Zap', backgroundColor: '#081510',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://maturazap.superzapmarketing.net/')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function handle(name, action) {
  ipcMain.handle(name, async (_event, ...args) => {
    try { return { ok: true, value: await action(...args) }; }
    catch (error) { return { ok: false, error: error.message || 'Não foi possível concluir.' }; }
  });
}

function selectedAccounts(ids) {
  const list = accounts.list().filter(account => ids.includes(account.id));
  if (list.length < 2) throw new Error('Selecione pelo menos duas contas conectadas.');
  return list;
}

function validateWarm(options) {
  const minimum = Number(options.minimum);
  const maximum = Number(options.maximum);
  const repetitions = Number(options.repetitions);
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 1 || maximum > 86400 || maximum < minimum) throw new Error('Use intervalos entre 1 e 86400 segundos; o máximo deve ser maior ou igual ao mínimo.');
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100000) throw new Error('Use de 1 a 100000 repetições.');
  const messages = String(options.messages || '').split(/\n\s*\n/).map(item => item.trim()).filter(Boolean);
  if (messages.length < 2) throw new Error('Adicione pelo menos duas mensagens separadas por uma linha em branco.');
  return { minimum, maximum, repetitions, messages };
}

const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, milliseconds);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Execução interrompida.')); }, { once: true });
});

async function runWarm(options) {
  if (warmController) throw new Error('Já existe um aquecimento em andamento.');
  license.ensureValid();
  const chosen = selectedAccounts(options.accountIds || []);
  const config = validateWarm(options);
  for (const account of chosen) {
    const status = await whatsapp.status(account);
    if (!status.connected) throw new Error(`Conecte o WhatsApp da conta ${account.nickname}.`);
  }
  warmController = new AbortController();
  const signal = warmController.signal;
  let first = true;
  let sent = 0;
  const total = config.repetitions * (chosen.length - 1) * chosen.length * 2;
  try {
    for (let round = 0; round < config.repetitions; round += 1) {
      for (let offset = 1; offset < chosen.length; offset += 1) {
        for (let origin = 0; origin < chosen.length; origin += 1) {
          const destination = (origin + offset) % chosen.length;
          const pairIndex = Math.floor(Math.random() * (config.messages.length - 1));
          const pair = [config.messages[pairIndex], config.messages[pairIndex + 1]];
          for (let direction = 0; direction < 2; direction += 1) {
            if (!first) {
              const seconds = config.minimum === config.maximum ? config.minimum : config.minimum + Math.floor(Math.random() * (config.maximum - config.minimum + 1));
              mainWindow.webContents.send('warm:progress', { state: 'waiting', seconds, sent, total });
              await wait(seconds * 1000, signal);
            }
            if (signal.aborted) throw new Error('Execução interrompida.');
            const from = direction === 0 ? chosen[origin] : chosen[destination];
            const to = direction === 0 ? chosen[destination] : chosen[origin];
            const message = pair[direction];
            const success = await whatsapp.send(from, to, message);
            sent += 1;
            mainWindow.webContents.send('warm:progress', { state: 'sending', sent, total, success, from: from.nickname, to: to.nickname, message });
            first = false;
          }
        }
      }
    }
    mainWindow.webContents.send('warm:progress', { state: 'complete', sent, total });
    return { sent, total };
  } finally { warmController = null; }
}

function configureIpc() {
  handle('bootstrap', async () => ({
    version: app.getVersion(), license: license.summary(), accounts: accounts.list(), settings: accounts.settings()
  }));
  handle('license:activate', key => license.activate(key));
  handle('account:add', async data => { const normalized = require('./phone').normalizePhone(data.number); await license.reserve(normalized); return accounts.add({ ...data, number: normalized }); });
  handle('account:remove', async id => { const item = accounts.list().find(account => account.id === id); if (!item) throw new Error('Conta não encontrada.'); await license.release(item.number); whatsapp.close(id); return accounts.remove(id); });
  handle('account:open', async id => { const item = accounts.list().find(account => account.id === id); if (!item) throw new Error('Conta não encontrada.'); await whatsapp.open(item); return true; });
  handle('account:statuses', async () => Object.fromEntries(await Promise.all(accounts.list().map(async item => [item.id, await whatsapp.status(item)]))));
  handle('settings:theme', theme => accounts.saveSettings({ theme: theme === 'light' ? 'light' : 'dark' }));
  handle('warm:start', runWarm);
  handle('warm:stop', async () => { warmController?.abort(); return true; });
  handle('update:install', async () => { autoUpdater.quitAndInstall(false, true); return true; });
}

function configureUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const notify = value => mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send('update:status', value);
  autoUpdater.on('checking-for-update', () => notify({ state: 'checking' }));
  autoUpdater.on('update-available', info => notify({ state: 'downloading', version: info.version }));
  autoUpdater.on('download-progress', progress => notify({ state: 'progress', percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', info => notify({ state: 'ready', version: info.version }));
  autoUpdater.on('error', () => notify({ state: 'error', message: 'Não foi possível verificar a atualização agora.' }));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

app.whenReady().then(async () => {
  app.setName('Matura Zap');
  license = new LicenseService(app.getPath('userData'));
  accounts = new AccountService(app.getPath('userData'));
  whatsapp = new WhatsAppService(license);
  configureIpc();
  createWindow();
  configureUpdates();
  if (license.summary().active) license.refresh().catch(error => mainWindow.webContents.send('update:status', { state: 'license-error', message: error.message }));
  setInterval(() => license.summary().active && license.refresh().catch(() => {}), 5 * 60 * 1000);
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

