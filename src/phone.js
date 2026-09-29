'use strict';

function normalizePhone(value) {
  const input = String(value || '').trim();
  if (!input || !/^\+?[0-9\s().-]+$/.test(input)) {
    throw new Error('Informe um telefone válido com DDD. Exemplo: (51) 99999-9999.');
  }
  let digits = input.replace(/\D/g, '');
  const international = input.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (international && !digits.startsWith('55')) {
    if (!/^[1-9][0-9]{7,14}$/.test(digits)) throw new Error('Informe o número internacional completo: +código do país e telefone.');
    return digits;
  }
  if (!international && digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) throw new Error('Inclua o DDD e o número completo. Para outro país, comece com + e o código do país.');
  const areas = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
  const area = digits.slice(0, 2);
  if (!areas.has(area)) throw new Error('Confira o DDD informado.');
  let subscriber = digits.slice(2);
  if (subscriber.length === 8 && subscriber[0] >= '6') subscriber = `9${subscriber}`;
  if ((subscriber.length === 9 && subscriber[0] !== '9') || (subscriber.length === 8 && (subscriber[0] < '2' || subscriber[0] > '5'))) throw new Error('Confira o número: celular deve ter nove dígitos; telefone fixo, oito.');
  return `55${area}${subscriber}`;
}

function accountHash(value, crypto) {
  return crypto.createHash('sha256').update(normalizePhone(value)).digest('hex');
}

module.exports = { normalizePhone, accountHash };

