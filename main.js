const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { createDatabase } = require('./db');

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const MIN_WIDTH = 260;
const MIN_HEIGHT = 360;
const MAX_WIDTH = 420;
const MAX_HEIGHT = 600;
const FIRST_WIDTH = 260;
const FIRST_HEIGHT = 360;
const DEFAULT_TIME_ZONE = 'America/New_York';
const SETTINGS_VERSION = 4;

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const DB_PATH = path.join(app.getPath('userData'), 'schedules.db.json');

const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION,
  opacity: 0.92,
  weekStartsOn: 0, // 0 = Sunday, 1 = Monday
  alwaysOnTop: true,
  timeZone: DEFAULT_TIME_ZONE,
  width: FIRST_WIDTH,
  height: FIRST_HEIGHT,
  x: null,
  y: null,
};

let settingsCache = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;
const db = createDatabase(DB_PATH);

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function writeSettingsFile(next) {
  settingsCache = next;
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
  return next;
}

function loadSettings() {
  if (settingsCache) return settingsCache;
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      const next = { ...DEFAULT_SETTINGS, ...raw, alwaysOnTop: true };
      // Upgrade / first-run migration: force smallest size + New York timezone once.
      if ((raw.settingsVersion || 0) < SETTINGS_VERSION) {
        next.width = FIRST_WIDTH;
        next.height = FIRST_HEIGHT;
        next.timeZone = DEFAULT_TIME_ZONE;
        next.alwaysOnTop = true;
        next.settingsVersion = SETTINGS_VERSION;
        return writeSettingsFile(next);
      }
      next.width = clamp(Number(next.width) || FIRST_WIDTH, MIN_WIDTH, MAX_WIDTH);
      next.height = clamp(Number(next.height) || FIRST_HEIGHT, MIN_HEIGHT, MAX_HEIGHT);
      if (!next.timeZone) next.timeZone = DEFAULT_TIME_ZONE;
      settingsCache = next;
      return settingsCache;
    }
  } catch (_) {
    /* use defaults */
  }
  return writeSettingsFile({ ...DEFAULT_SETTINGS });
}

function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial, alwaysOnTop: true };
  if (next.width != null) next.width = clamp(Number(next.width) || FIRST_WIDTH, MIN_WIDTH, MAX_WIDTH);
  if (next.height != null) next.height = clamp(Number(next.height) || FIRST_HEIGHT, MIN_HEIGHT, MAX_HEIGHT);
  if (!next.timeZone) next.timeZone = DEFAULT_TIME_ZONE;
  next.settingsVersion = SETTINGS_VERSION;
  return writeSettingsFile(next);
}

function clampOpacity(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return DEFAULT_SETTINGS.opacity;
  return Math.min(1, Math.max(0.2, n));
}

function enforceAlwaysOnTop() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  try {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (_) {
    /* not supported on all platforms */
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  enforceAlwaysOnTop();
  mainWindow.focus();
}

function loadTrayIcon() {
  const candidates = [
    path.join(__dirname, 'assets', 'tray-icon.png'),
    path.join(__dirname, 'assets', 'icon-16.png'),
    path.join(__dirname, 'assets', 'icon.png'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const img = nativeImage.createFromPath(file);
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
  }
  return nativeImage.createEmpty();
}

function createTray() {
  if (tray) return;
  tray = new Tray(loadTrayIcon());
  tray.setToolTip('Calendar Gadget');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show Calendar',
        click: () => showMainWindow(),
      },
      {
        label: 'Hide Calendar',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
          app.quit();
        },
      },
    ])
  );
  tray.on('click', () => showMainWindow());
  tray.on('double-click', () => showMainWindow());
}

function createWindow() {
  const settings = loadSettings();
  const display = screen.getPrimaryDisplay().workArea;
  const width = clamp(Number(settings.width) || FIRST_WIDTH, MIN_WIDTH, MAX_WIDTH);
  const height = clamp(Number(settings.height) || FIRST_HEIGHT, MIN_HEIGHT, MAX_HEIGHT);
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
    skipTaskbar: true,
    alwaysOnTop: true,
    opacity: clampOpacity(settings.opacity),
    backgroundColor: '#e8eef4',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
  mainWindow.setMaximumSize(MAX_WIDTH, MAX_HEIGHT);
  // Force exact launch size (avoids DPI / leftover bounds drift).
  mainWindow.setSize(width, height);
  enforceAlwaysOnTop();

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setSize(width, height);
    enforceAlwaysOnTop();
    mainWindow.show();
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

  mainWindow.on('will-resize', (event, newBounds) => {
    const nextW = clamp(newBounds.width, MIN_WIDTH, MAX_WIDTH);
    const nextH = clamp(newBounds.height, MIN_HEIGHT, MAX_HEIGHT);
    if (nextW === newBounds.width && nextH === newBounds.height) return;
    event.preventDefault();
    mainWindow.setBounds({
      x: newBounds.x,
      y: newBounds.y,
      width: nextW,
      height: nextH,
    });
  });

  mainWindow.on('resized', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [w, h] = mainWindow.getSize();
    const nextW = clamp(w, MIN_WIDTH, MAX_WIDTH);
    const nextH = clamp(h, MIN_HEIGHT, MAX_HEIGHT);
    if (nextW !== w || nextH !== h) {
      mainWindow.setSize(nextW, nextH);
    }
    schedulePersistBounds();
  });
  mainWindow.on('moved', schedulePersistBounds);
  mainWindow.on('blur', () => enforceAlwaysOnTop());
  mainWindow.on('focus', () => enforceAlwaysOnTop());
  mainWindow.on('show', () => enforceAlwaysOnTop());
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
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
  enforceAlwaysOnTop();
  if (partial.width != null || partial.height != null) {
    mainWindow.setSize(settings.width, settings.height);
  }

  return settings;
}

function ensureAutoLaunch() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    ensureAutoLaunch();
    createTray();
    createWindow();

    app.on('activate', () => {
      showMainWindow();
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // Keep running in the system tray on Windows/Linux.
  if (process.platform === 'darwin') app.quit();
});

ipcMain.handle('settings:get', () => ({
  ...loadSettings(),
  limits: { minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT, maxWidth: MAX_WIDTH, maxHeight: MAX_HEIGHT },
}));

ipcMain.handle('settings:set', (_event, partial) => applySettings(partial || {}));

ipcMain.handle('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
});

ipcMain.handle('window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
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
