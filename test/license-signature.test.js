'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyEnvelope } = require('../src/license-service');

test('valida exatamente o texto Base64 assinado pelo painel PHP', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const claims = { type: 'license', fingerprint: 'a'.repeat(64), expires_at: 2_000_000_000 };
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(payload, 'utf8'), privateKey).toString('base64');

  assert.deepEqual(verifyEnvelope({ payload, signature }, 'license', publicKey), claims);
});

test('rejeita conteúdo alterado depois da assinatura', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const payload = Buffer.from(JSON.stringify({ type: 'license' }), 'utf8').toString('base64');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(payload, 'utf8'), privateKey).toString('base64');
  const changed = Buffer.from(JSON.stringify({ type: 'license', admin: true }), 'utf8').toString('base64');

  assert.throws(() => verifyEnvelope({ payload: changed, signature }, 'license', publicKey), /autenticidade/);
});
