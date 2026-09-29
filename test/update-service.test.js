'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isNewerVersion, parseLatestVersion } = require('../src/update-service');

test('identifica uma atualização mais nova', () => {
  assert.equal(isNewerVersion('1.0.3', '1.0.2'), true);
  assert.equal(isNewerVersion('1.0.2', '1.0.2'), false);
  assert.equal(isNewerVersion('1.0.1', '1.0.2'), false);
});

test('lê a versão do manifesto publicado', () => {
  assert.equal(parseLatestVersion("version: 1.0.3\nfiles:\n"), '1.0.3');
  assert.throws(() => parseLatestVersion('files: []'));
});
