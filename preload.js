const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('calendarApi', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  setCompact: (compact) => ipcRenderer.invoke('window:setCompact', compact),
  close: () => ipcRenderer.invoke('window:close'),
  showWindow: () => ipcRenderer.invoke('window:show'),
  getPosition: () => ipcRenderer.invoke('window:getPosition'),
  setPosition: (x, y) => ipcRenderer.invoke('window:setPosition', x, y),
  togglePin: () => ipcRenderer.invoke('window:togglePin'),
  setClickThrough: (enabled) => ipcRenderer.invoke('window:setClickThrough', enabled),
  showOpacityMenu: () => ipcRenderer.invoke('menu:opacity'),
  onCompactChanged: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('window:compact', listener);
    return () => ipcRenderer.removeListener('window:compact', listener);
  },
  onPinChanged: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('window:pin-changed', listener);
    return () => ipcRenderer.removeListener('window:pin-changed', listener);
  },
  onOpacityChanged: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('settings:opacity', listener);
    return () => ipcRenderer.removeListener('settings:opacity', listener);
  },
  onCompactMethodChanged: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('settings:compact-method', listener);
    return () => ipcRenderer.removeListener('settings:compact-method', listener);
  },
  getTimeZones: () => ipcRenderer.invoke('system:timeZones'),
  listSchedulesByDate: (date) => ipcRenderer.invoke('schedules:listByDate', date),
  listScheduleDatesInMonth: (year, month) =>
    ipcRenderer.invoke('schedules:listDatesInMonth', year, month),
  createSchedule: (payload) => ipcRenderer.invoke('schedules:create', payload),
  updateSchedule: (id, patch) => ipcRenderer.invoke('schedules:update', id, patch),
  deleteSchedule: (id) => ipcRenderer.invoke('schedules:delete', id),
  getTarget: () => ipcRenderer.invoke('target:get'),
  setTarget: (iso) => ipcRenderer.invoke('target:set', iso),
  clearTarget: () => ipcRenderer.invoke('target:clear'),
  dismissAlarm: () => ipcRenderer.invoke('alarm:dismiss'),
  onAlarmTriggered: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('alarm:triggered', listener);
    return () => ipcRenderer.removeListener('alarm:triggered', listener);
  },
  onAlarmStopped: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('alarm:stopped', listener);
    return () => ipcRenderer.removeListener('alarm:stopped', listener);
  },
  onHourMilestone: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('hour:milestone', listener);
    return () => ipcRenderer.removeListener('hour:milestone', listener);
  },
  onHourMilestoneClear: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('hour:milestone-clear', listener);
    return () => ipcRenderer.removeListener('hour:milestone-clear', listener);
  },
  onThirtyMinuteMilestone: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('thirty:milestone', listener);
    return () => ipcRenderer.removeListener('thirty:milestone', listener);
  },
  onThirtyMinuteMilestoneClear: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('thirty:milestone-clear', listener);
    return () => ipcRenderer.removeListener('thirty:milestone-clear', listener);
  },
  onHelpOpen: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('help:open', listener);
    return () => ipcRenderer.removeListener('help:open', listener);
  },
});
