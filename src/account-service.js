'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizePhone } = require('./phone');

class AccountService {
  constructor(userData) {
    this.path = path.join(userData, 'accounts.json');
    this.settingsPath = path.join(userData, 'settings.json');
  }

  readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
  }

  writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  list() { return this.readJson(this.path, []); }
  settings() { return { theme: 'dark', ...this.readJson(this.settingsPath, {}) }; }
  saveSettings(settings) { this.writeJson(this.settingsPath, { ...this.settings(), ...settings }); return this.settings(); }

  add(data) {
    const number = normalizePhone(data.number);
    const accounts = this.list();
    if (accounts.some(item => item.number === number)) throw new Error('Este WhatsApp já está cadastrado.');
    const account = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), number,
      nickname: String(data.nickname || '').trim() || number,
      proxy: String(data.proxy || '').trim()
    };
    accounts.push(account);
    this.writeJson(this.path, accounts);
    return account;
  }

  remove(id) {
    const accounts = this.list();
    const account = accounts.find(item => item.id === id);
    if (!account) throw new Error('Conta não encontrada.');
    this.writeJson(this.path, accounts.filter(item => item.id !== id));
    return account;
  }
}

module.exports = { AccountService };

