'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone } = require('../src/phone');

test('adiciona o código do Brasil a números com DDD', () => assert.equal(normalizePhone('(51) 99999-9999'), '5551999999999'));
test('preserva número internacional já completo', () => assert.equal(normalizePhone('+55 51 99999-9999'), '5551999999999'));
test('aceita prefixo internacional 00', () => assert.equal(normalizePhone('005551999999999'), '5551999999999'));
test('rejeita número incompleto', () => assert.throws(() => normalizePhone('9999-9999')));
test('preserva número internacional de outro país', () => assert.equal(normalizePhone('+1 415 555 2671'), '14155552671'));
test('normaliza celular brasileiro antigo com oito dígitos', () => assert.equal(normalizePhone('(51) 8888-7777'), '5551988887777'));
test('rejeita DDD brasileiro inexistente', () => assert.throws(() => normalizePhone('(20) 99999-9999')));

