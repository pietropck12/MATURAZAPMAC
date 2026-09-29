'use strict';

const MANIFEST_URL = 'https://github.com/pietropck12/MATURAZAPMAC/releases/latest/download/latest-mac.yml';
const DOWNLOAD_URL = 'https://maturazap.superzapmarketing.net/download/mac';

function versionParts(value) {
  if (!/^\d+\.\d+\.\d+$/.test(String(value || ''))) throw new Error('Versão de atualização inválida.');
  return String(value).split('.').map(Number);
}

function isNewerVersion(candidate, current) {
  const left = versionParts(candidate);
  const right = versionParts(current);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

function parseLatestVersion(manifest) {
  const match = String(manifest || '').match(/^version:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/m);
  if (!match) throw new Error('Manifesto de atualização inválido.');
  return match[1];
}

module.exports = { MANIFEST_URL, DOWNLOAD_URL, isNewerVersion, parseLatestVersion };
