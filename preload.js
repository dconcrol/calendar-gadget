const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('calendarApi', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  getTimeZones: () => ipcRenderer.invoke('system:timeZones'),
  listSchedulesByDate: (date) => ipcRenderer.invoke('schedules:listByDate', date),
  listScheduleDatesInMonth: (year, month) =>
    ipcRenderer.invoke('schedules:listDatesInMonth', year, month),
  createSchedule: (payload) => ipcRenderer.invoke('schedules:create', payload),
  updateSchedule: (id, patch) => ipcRenderer.invoke('schedules:update', id, patch),
  deleteSchedule: (id) => ipcRenderer.invoke('schedules:delete', id),
});
