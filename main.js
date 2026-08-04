const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { createDatabase } = require('./db');

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const MIN_WIDTH = 300;
const MIN_HEIGHT = 420;
const MAX_WIDTH = 520;
const MAX_HEIGHT = 760;

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const DB_PATH = path.join(app.getPath('userData'), 'schedules.db.json');

const DEFAULT_SETTINGS = {
  opacity: 0.92,
  weekStartsOn: 0, // 0 = Sunday, 1 = Monday
  alwaysOnTop: true,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  width: 340,
  height: 480,
  x: null,
  y: null,
};

let settingsCache = null;
let mainWindow = null;
const db = createDatabase(DB_PATH);

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function loadSettings() {
  if (settingsCache) return settingsCache;
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      settingsCache = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) };
      return settingsCache;
    }
  } catch (_) {
    /* use defaults */
  }
  settingsCache = { ...DEFAULT_SETTINGS };
  return settingsCache;
}

function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  if (next.width != null) next.width = clamp(Number(next.width) || DEFAULT_SETTINGS.width, MIN_WIDTH, MAX_WIDTH);
  if (next.height != null) next.height = clamp(Number(next.height) || DEFAULT_SETTINGS.height, MIN_HEIGHT, MAX_HEIGHT);
  settingsCache = next;
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
  return next;
}

function clampOpacity(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return DEFAULT_SETTINGS.opacity;
  return Math.min(1, Math.max(0.2, n));
}

function createWindow() {
  const settings = loadSettings();
  const display = screen.getPrimaryDisplay().workArea;
  const width = clamp(settings.width || DEFAULT_SETTINGS.width, MIN_WIDTH, MAX_WIDTH);
  const height = clamp(settings.height || DEFAULT_SETTINGS.height, MIN_HEIGHT, MAX_HEIGHT);
  let x = settings.x;
  let y = settings.y;

  if (x == null || y == null) {
    x = display.x + display.width - width - 24;
    y = display.y + 24;
  }

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    maxWidth: MAX_WIDTH,
    maxHeight: MAX_HEIGHT,
    show: false,
    frame: false,
    transparent: false,
    resizable: true,
    hasShadow: true,
    skipTaskbar: false,
    alwaysOnTop: !!settings.alwaysOnTop,
    opacity: clampOpacity(settings.opacity),
    backgroundColor: '#e8eef4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  let boundsTimer = null;
  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [w, h] = mainWindow.getSize();
    const [px, py] = mainWindow.getPosition();
    saveSettings({ width: w, height: h, x: px, y: py });
  };
  const schedulePersistBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(persistBounds, 250);
  };

  mainWindow.on('resized', schedulePersistBounds);
  mainWindow.on('moved', schedulePersistBounds);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function applySettings(partial) {
  const settings = saveSettings(partial);
  if (!mainWindow || mainWindow.isDestroyed()) return settings;

  if (partial.opacity != null) {
    mainWindow.setOpacity(clampOpacity(settings.opacity));
  }
  if (partial.alwaysOnTop != null) {
    mainWindow.setAlwaysOnTop(!!settings.alwaysOnTop);
  }
  if (partial.width != null || partial.height != null) {
    mainWindow.setSize(settings.width, settings.height);
  }

  return settings;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('settings:get', () => ({
  ...loadSettings(),
  limits: { minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT, maxWidth: MAX_WIDTH, maxHeight: MAX_HEIGHT },
}));

ipcMain.handle('settings:set', (_event, partial) => applySettings(partial || {}));

ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('system:timeZones', () => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch (_) {
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Australia/Sydney',
    ];
  }
});

ipcMain.handle('schedules:listByDate', (_event, date) => db.listByDate(date));

ipcMain.handle('schedules:listDatesInMonth', (_event, year, month) => db.listDatesInMonth(year, month));

ipcMain.handle('schedules:create', (_event, payload) => {
  try {
    return { ok: true, item: db.create(payload || {}) };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to create schedule' };
  }
});

ipcMain.handle('schedules:update', (_event, id, patch) => {
  try {
    return { ok: true, item: db.update(id, patch || {}) };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to update schedule' };
  }
});

ipcMain.handle('schedules:delete', (_event, id) => {
  try {
    db.remove(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to delete schedule' };
  }
});
