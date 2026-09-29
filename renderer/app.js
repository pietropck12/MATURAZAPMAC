'use strict';

const $ = selector => document.querySelector(selector);
let state = { accounts: [], statuses: {}, settings: { theme: 'dark' } };

function unwrap(result) { if (!result.ok) throw new Error(result.error); return result.value; }
function message(element, text = '', kind = '') { element.textContent = text; element.className = `message ${kind}`; }
function date(value) { return value ? new Date(value * 1000).toLocaleDateString('pt-BR') : '—'; }
function escapeHtml(value) { const item = document.createElement('span'); item.textContent = String(value); return item.innerHTML; }

function setTheme(theme) {
  state.settings.theme = theme;
  document.body.classList.toggle('light', theme === 'light');
  document.body.classList.toggle('dark', theme !== 'light');
  $('#themeButton').textContent = theme === 'light' ? '☀' : '☾';
}

function renderAccounts() {
  $('#accountList').innerHTML = state.accounts.length ? state.accounts.map(account => {
    const status = state.statuses[account.id] || {};
    const label = status.connected ? 'Conectada' : status.open ? 'Aguardando conexão' : 'Fechada';
    return `<article class="account-item"><div><strong>${escapeHtml(account.nickname)}</strong><div class="account-meta">+${escapeHtml(account.number)}${account.proxy ? ' · Proxy configurado' : ''}</div><span class="status ${status.connected ? 'connected' : ''}">${label}</span></div><div class="account-actions"><button class="primary small" data-open="${account.id}">Abrir</button><button class="danger small" data-remove="${account.id}">Remover</button></div></article>`;
  }).join('') : '<div class="empty">Nenhuma conta cadastrada.<br>Adicione a primeira conta ao lado.</div>';
  $('#warmAccounts').innerHTML = state.accounts.length ? state.accounts.map(account => `<label class="select-account"><input type="checkbox" value="${account.id}"><span><strong>${escapeHtml(account.nickname)}</strong><small>+${escapeHtml(account.number)}</small></span></label>`).join('') : '<div class="empty">Cadastre pelo menos duas contas.</div>';
}

async function refreshStatuses() {
  try { state.statuses = unwrap(await window.matura.statuses()); renderAccounts(); } catch {}
}

async function boot() {
  try {
    const data = unwrap(await window.matura.bootstrap());
    state = { ...state, ...data };
    setTheme(data.settings.theme || 'dark');
    $('#version').textContent = `Versão ${data.version}`;
    if (!data.license.active) { $('#activation').classList.remove('hidden'); return; }
    $('#application').classList.remove('hidden');
    $('#licenseStatus').textContent = `Licença ativa até ${date(data.license.expiresAt)}`;
    renderAccounts();
    refreshStatuses();
    setInterval(refreshStatuses, 12000);
  } catch (error) { $('#activation').classList.remove('hidden'); message($('#activationMessage'), error.message, 'error'); }
}

$('#pasteKey').addEventListener('click', async () => {
  try { $('#licenseKey').value = (await navigator.clipboard.readText()).trim(); } catch { message($('#activationMessage'), 'Cole a chave usando Command + V.', 'error'); }
});

$('#activateButton').addEventListener('click', async () => {
  const button = $('#activateButton'); button.disabled = true; message($('#activationMessage'), 'Validando sua licença…');
  try { unwrap(await window.matura.activate($('#licenseKey').value)); location.reload(); }
  catch (error) { message($('#activationMessage'), error.message, 'error'); }
  finally { button.disabled = false; }
});

$('#accountForm').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; message($('#accountMessage'), 'Salvando conta…');
  try {
    const account = unwrap(await window.matura.addAccount({ number: $('#number').value, nickname: $('#nickname').value, proxy: $('#proxy').value }));
    state.accounts.push(account); event.target.reset(); renderAccounts(); message($('#accountMessage'), 'Conta adicionada.', 'success');
  } catch (error) { message($('#accountMessage'), error.message, 'error'); }
  finally { button.disabled = false; }
});

document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-view]');
  if (nav) {
    document.querySelectorAll('.nav').forEach(item => item.classList.toggle('active', item === nav));
    $('#accountsView').classList.toggle('hidden', nav.dataset.view !== 'accounts');
    $('#warmView').classList.toggle('hidden', nav.dataset.view !== 'warm');
  }
  const open = event.target.closest('[data-open]');
  if (open) { open.disabled = true; try { unwrap(await window.matura.openAccount(open.dataset.open)); setTimeout(refreshStatuses, 3000); } catch (error) { message($('#accountMessage'), error.message, 'error'); } finally { open.disabled = false; } }
  const remove = event.target.closest('[data-remove]');
  if (remove && confirm('Remover esta conta e liberar sua vaga na licença?')) {
    remove.disabled = true;
    try { unwrap(await window.matura.removeAccount(remove.dataset.remove)); state.accounts = state.accounts.filter(item => item.id !== remove.dataset.remove); renderAccounts(); }
    catch (error) { message($('#accountMessage'), error.message, 'error'); remove.disabled = false; }
  }
});

$('#refreshStatus').addEventListener('click', refreshStatuses);
$('#themeButton').addEventListener('click', async () => { const theme = state.settings.theme === 'light' ? 'dark' : 'light'; setTheme(theme); await window.matura.saveTheme(theme); });

$('#startWarm').addEventListener('click', async () => {
  const accountIds = [...document.querySelectorAll('#warmAccounts input:checked')].map(input => input.value);
  $('#startWarm').disabled = true; $('#stopWarm').disabled = false; $('#activity').innerHTML = ''; message($('#warmMessage'), 'Preparando execução…');
  try {
    unwrap(await window.matura.startWarm({ accountIds, messages: $('#messages').value, minimum: Number($('#minimum').value), maximum: Number($('#maximum').value), repetitions: Number($('#repetitions').value) }));
    message($('#warmMessage'), 'Aquecimento concluído.', 'success');
  } catch (error) { message($('#warmMessage'), error.message, error.message.includes('interrompida') ? '' : 'error'); }
  finally { $('#startWarm').disabled = false; $('#stopWarm').disabled = true; }
});
$('#stopWarm').addEventListener('click', () => window.matura.stopWarm());

window.matura.onWarmProgress(value => {
  const percent = value.total ? Math.round(value.sent / value.total * 100) : 0;
  $('#progressBar').style.width = `${percent}%`;
  $('#executionTitle').textContent = value.state === 'complete' ? 'Execução concluída' : value.state === 'waiting' ? `Aguardando ${value.seconds} segundos` : `Envio ${value.sent} de ${value.total}`;
  $('#executionDetail').textContent = `${percent}% concluído`;
  if (value.from) {
    const row = document.createElement('div'); row.className = `activity-row ${value.success ? 'ok' : 'fail'}`;
    row.textContent = `${value.from} → ${value.to}: ${value.success ? 'Enviada' : 'Falhou'} · ${value.message}`;
    $('#activity').prepend(row);
  }
});

window.matura.onUpdate(value => {
  const banner = $('#updateBanner');
  const activation = $('#activationUpdate');
  const showManual = text => {
    $('#activationUpdateText').textContent = text;
    activation.classList.remove('hidden');
    banner.classList.remove('hidden');
    $('#updateText').textContent = text;
    $('#installUpdate').textContent = 'Baixar nova versão';
    $('#installUpdate').classList.remove('hidden');
    $('#installUpdate').dataset.manual = '1';
  };
  if (value.state === 'ready') { banner.classList.remove('hidden'); $('#updateText').textContent = `Matura Zap ${value.version} está pronto para instalar.`; $('#installUpdate').classList.remove('hidden'); }
  else if (value.state === 'downloading') { banner.classList.remove('hidden'); $('#updateText').textContent = `Baixando atualização ${value.version}…`; $('#installUpdate').classList.add('hidden'); }
  else if (value.state === 'progress') { banner.classList.remove('hidden'); $('#updateText').textContent = `Baixando atualização: ${value.percent}%`; }
  else if (value.state === 'license-error') { banner.classList.remove('hidden'); $('#updateText').textContent = value.message; $('#installUpdate').classList.add('hidden'); }
  else if (value.state === 'manual') showManual(value.message || `Matura Zap ${value.version} está disponível.`);
});
$('#installUpdate').addEventListener('click', event => event.currentTarget.dataset.manual === '1' ? window.matura.downloadUpdate() : window.matura.installUpdate());
$('#activationDownload').addEventListener('click', () => window.matura.downloadUpdate());

boot();
