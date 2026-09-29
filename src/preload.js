'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('matura', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  activate: key => ipcRenderer.invoke('license:activate', key),
  addAccount: data => ipcRenderer.invoke('account:add', data),
  removeAccount: id => ipcRenderer.invoke('account:remove', id),
  openAccount: id => ipcRenderer.invoke('account:open', id),
  statuses: () => ipcRenderer.invoke('account:statuses'),
  saveTheme: theme => ipcRenderer.invoke('settings:theme', theme),
  startWarm: options => ipcRenderer.invoke('warm:start', options),
  stopWarm: () => ipcRenderer.invoke('warm:stop'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  onWarmProgress: callback => ipcRenderer.on('warm:progress', (_event, value) => callback(value)),
  onUpdate: callback => ipcRenderer.on('update:status', (_event, value) => callback(value))
});
