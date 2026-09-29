'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { machineIdSync } = require('node-machine-id');
const { safeStorage } = require('electron');
const { normalizePhone } = require('./phone');

const API_BASE = 'https://maturazap.superzapmarketing.net';
const VERSION = require('../package.json').version;
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA2GrKZOepPS80z355uS19
c9nJFesYKCIcTDA16WNasa6liGg3v9xq7iW+ei0BH2O4R6rUnNrzol+Il4uvYRpX
goXAwOREKbzicgz7mH248alDrz8u6K8qOdv/g1UJeIn2IxgVksCnIhVcmFVRvW3l
64POehxfMpTdF9Wt7yIPXaqOaRbkxy+X2G5tzkUJ99dWse9Gqa6cNeQAnFe7SkQY
dJUd24cPPEvBniR8+F2neP6o4RdGbXAzT8NAeZGxlw5LOf/3Nkh01O1zY2qBU6ce
7KmpkFAs4HYZiPiFHtdx0yrtqxbsAdQoNlucWo34jbfiVxvJLPCZfMSYmzxWuEbT
sp5PksdJURaX5aaGlo4Tv3YAZ/kp7cpXk5xaG62z/TPGu5H+cj2HF2T6j2ulRlp3
ehRnNJwme2JZQ9uOABU9sUzEZXTNc+wYY+m4fiBtdUrrYnPMacC2mlV9z2qqITij
ZncNc62hr3JbVASgp2arw+x+zA6C3ypvB8s3VQv5K6gtAgMBAAE=
-----END PUBLIC KEY-----`;

class LicenseError extends Error {
  constructor(message, code = 'license_error') { super(message); this.code = code; }
}

class LicenseService {
  constructor(userData) {
    this.statePath = path.join(userData, 'activation.dat');
    this.fingerprint = crypto.createHash('sha256').update(machineIdSync(true)).digest('hex');
    this.credential = '';
    this.entitlement = null;
    this.claims = null;
    this.lastUtc = 0;
    this.startedAt = Date.now();
    this.serverFloor = 0;
    this.load();
  }

  verify(envelope, type = 'license') {
    if (!envelope?.payload || !envelope?.signature) throw new LicenseError('Resposta de licença ausente.');
    const payload = Buffer.from(envelope.payload, 'base64');
    const valid = crypto.verify('RSA-SHA256', payload, PUBLIC_KEY, Buffer.from(envelope.signature, 'base64'));
    if (!valid) throw new LicenseError('Não foi possível verificar a autenticidade da licença.', 'invalid_signature');
    const claims = JSON.parse(payload.toString('utf8'));
    if (claims.type !== type) throw new LicenseError('Resposta de licença inválida.');
    return claims;
  }

  load() {
    try {
      if (!fs.existsSync(this.statePath) || !safeStorage.isEncryptionAvailable()) return;
      const raw = safeStorage.decryptString(fs.readFileSync(this.statePath));
      const state = JSON.parse(raw);
      const claims = this.verify(state.entitlement);
      if (claims.fingerprint !== this.fingerprint) throw new Error('fingerprint');
      this.credential = state.credential;
      this.entitlement = state.entitlement;
      this.claims = claims;
      this.lastUtc = Number(state.lastUtc || 0);
      this.serverFloor = Number(claims.issued_at || 0);
      this.startedAt = Date.now();
    } catch {
      this.credential = '';
      this.entitlement = null;
      this.claims = null;
    }
  }

  save() {
    if (!safeStorage.isEncryptionAvailable()) throw new LicenseError('O Chaves do macOS não está disponível.');
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const state = JSON.stringify({ credential: this.credential, entitlement: this.entitlement, lastUtc: this.lastUtc });
    const temporary = `${this.statePath}.tmp`;
    fs.writeFileSync(temporary, safeStorage.encryptString(state), { mode: 0o600 });
    fs.renameSync(temporary, this.statePath);
  }

  accept(envelope) {
    const claims = this.verify(envelope);
    if (claims.fingerprint !== this.fingerprint) throw new LicenseError('Esta licença pertence a outro computador.');
    this.entitlement = envelope;
    this.claims = claims;
    this.lastUtc = Math.floor(Date.now() / 1000);
    this.serverFloor = Number(claims.issued_at || 0);
    this.startedAt = Date.now();
    this.save();
    this.ensureValid();
  }

  ensureValid() {
    if (!this.claims || !this.credential) throw new LicenseError('Ative sua licença para continuar.', 'activation_required');
    const now = Math.floor(Date.now() / 1000);
    if (now + 120 < this.lastUtc) throw new LicenseError('O relógio do computador foi alterado. Conecte-se para validar a licença.', 'clock_changed');
    const effective = Math.max(now, this.serverFloor + Math.floor((Date.now() - this.startedAt) / 1000));
    if (effective > Number(this.claims.expires_at)) throw new LicenseError('Sua licença venceu. Renove o plano para continuar.', 'license_expired');
    if (effective > Number(this.claims.offline_until)) throw new LicenseError('Conecte-se à internet para confirmar sua licença.', 'offline_expired');
    this.lastUtc = Math.max(this.lastUtc, now);
    return true;
  }

  summary() {
    if (!this.claims) return { active: false };
    return {
      active: true,
      expiresAt: Number(this.claims.expires_at || 0),
      offlineUntil: Number(this.claims.offline_until || 0),
      maxPcs: Number(this.claims.max_pcs || 0),
      maxWhatsapp: Number(this.claims.max_whatsapp || 0)
    };
  }

  async post(endpoint, body, authenticated = true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const headers = { 'content-type': 'application/json', accept: 'application/json' };
      if (authenticated) headers.authorization = `Bearer ${this.credential}`;
      const response = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, redirect: 'error' });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new LicenseError(json?.message || 'Acesso não autorizado.', json?.error || 'denied');
      return json;
    } catch (error) {
      if (error instanceof LicenseError) throw error;
      throw new Error('Não foi possível conectar ao painel do Matura Zap.');
    } finally { clearTimeout(timeout); }
  }

  async activate(key) {
    const result = await this.post('/api/license/activate', {
      license_key: String(key || '').trim().toUpperCase(), fingerprint: this.fingerprint,
      device_name: `${os.hostname()} (Mac)`, version: VERSION
    }, false);
    this.verify(result.entitlement);
    this.credential = result.credential;
    this.accept(result.entitlement);
    return this.summary();
  }

  async refresh() {
    this.ensureValid();
    try {
      const entitlement = await this.post('/api/license/heartbeat', { fingerprint: this.fingerprint, version: VERSION });
      this.accept(entitlement);
    } catch (error) {
      if (error instanceof LicenseError) { this.claims = null; this.entitlement = null; this.save(); throw error; }
      this.ensureValid();
    }
    return this.summary();
  }

  async reserve(account) {
    this.ensureValid();
    const entitlement = await this.post('/api/license/account/reserve', { account: normalizePhone(account) });
    this.accept(entitlement);
  }

  async release(account) {
    this.ensureValid();
    const entitlement = await this.post('/api/license/account/release', { account: normalizePhone(account) });
    this.accept(entitlement);
  }

  isAccountAllowed(account) {
    this.ensureValid();
    const hash = crypto.createHash('sha256').update(normalizePhone(account)).digest('hex');
    if (!Array.isArray(this.claims.accounts) || !this.claims.accounts.includes(hash)) {
      throw new LicenseError('Esta conta não está autorizada na licença.', 'account_not_reserved');
    }
    return true;
  }
}

module.exports = { LicenseService, LicenseError, PUBLIC_KEY, API_BASE };

