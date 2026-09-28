const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, powerMonitor, Notification, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { createDatabase } = require('./db');
const { createDayTrayImage } = require('./trayIcon');

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('lang', 'en-US');
// Prevent blank frameless windows on some Windows GPU drivers.
app.disableHardwareAcceleration();

const MIN_WIDTH = 260;
const MIN_HEIGHT = 360;
const MAX_WIDTH = 420;
const MAX_HEIGHT = 600;
const FIRST_WIDTH = 260;
const FIRST_HEIGHT = 360;
const COMPACT_ORIGIN_WIDTH = 100;
const COMPACT_ORIGIN_HEIGHT = 40; // date-only chip at screen right
const COMPACT_ORIGIN_MIN_WIDTH = 80;
const COMPACT_ORIGIN_MIN_HEIGHT = 32;
const COMPACT_HOVER_HEIGHT = 124; // clock + optional countdown + date
const COMPACT_HOVER_MIN_WIDTH = 180;
const COMPACT_HOVER_MIN_HEIGHT = 78;
const DEFAULT_TIME_ZONE = 'America/New_York';
const SETTINGS_VERSION = 4;
const MAX_TIMEOUT_MS = 2147483647;

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
  compactMode: false,
  compactMethod: 'origin', // 'origin' = time chip right edge; 'hover' = large compact clock
  toggleHotkey: 'CommandOrControl+Alt+C', // show/hide window; empty string disables
  targetTime: null, // ISO string or null
  targetCreatedAt: null, // ISO string when target was set (for progress ring)
  targetAlarmHandled: false,
  hourMilestonesFired: [], // whole-hour remaining marks already announced
  thirtyMinuteFired: false,
};

let settingsCache = null;
let mainWindow = null;
let tray = null;
let trayDay = null;
let trayDayTimer = null;
let isQuitting = false;
let alarmTimer = null;
let alarmInterval = null;
let alarmActive = false;
let hourMilestoneTimers = [];
let thirtyMinuteTimer = null;
let registeredToggleHotkey = null;
/** Last display id for the main window — used to undo DPI size jumps across monitors. */
let lastWindowDisplayId = null;
let suppressingDpiPersist = false;
const HOUR_MS = 60 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;
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
      const next = { ...DEFAULT_SETTINGS, ...raw };
      if (typeof next.alwaysOnTop !== 'boolean') next.alwaysOnTop = true;
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
      next.compactMethod = next.compactMethod === 'hover' ? 'hover' : 'origin';
      settingsCache = next;
      return settingsCache;
    }
  } catch (_) {
    /* use defaults */
  }
  return writeSettingsFile({ ...DEFAULT_SETTINGS });
}

function saveSettings(partial) {
  const current = loadSettings();
  const next = { ...current, ...partial };
  if (partial.alwaysOnTop === undefined) next.alwaysOnTop = current.alwaysOnTop;
  next.alwaysOnTop = !!next.alwaysOnTop;
  if (next.width != null) next.width = clamp(Number(next.width) || FIRST_WIDTH, MIN_WIDTH, MAX_WIDTH);
  if (next.height != null) next.height = clamp(Number(next.height) || FIRST_HEIGHT, MIN_HEIGHT, MAX_HEIGHT);
  if (!next.timeZone) next.timeZone = DEFAULT_TIME_ZONE;
  next.compactMethod = next.compactMethod === 'hover' ? 'hover' : 'origin';
  next.settingsVersion = SETTINGS_VERSION;
  return writeSettingsFile(next);
}

function clampOpacity(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return DEFAULT_SETTINGS.opacity;
  return Math.min(1, Math.max(0.2, n));
}

function applyAlwaysOnTop(enabled) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (enabled) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    try {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch (_) {
      /* not supported on all platforms */
    }
  } else {
    mainWindow.setAlwaysOnTop(false);
    try {
      mainWindow.setVisibleOnAllWorkspaces(false);
    } catch (_) {
      /* ignore */
    }
  }
  syncClickThroughFromSettings();
}

function setClickThrough(enabled) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (enabled) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      mainWindow.setIgnoreMouseEvents(false);
    }
  } catch (_) {
    /* ignore */
  }
}

function syncClickThroughFromSettings(settings = loadSettings()) {
  // Click-through only while pinned AND compact, and never during an active alarm.
  const clickThrough =
    !!settings.alwaysOnTop && !!settings.compactMode && !alarmActive;
  setClickThrough(clickThrough);
  return clickThrough;
}

function enforceAlwaysOnTop() {
  applyAlwaysOnTop(!!loadSettings().alwaysOnTop);
}

function toggleAlwaysOnTop() {
  const next = !loadSettings().alwaysOnTop;
  const settings = saveSettings({ alwaysOnTop: next });
  applyAlwaysOnTop(next);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window:pin-changed', { alwaysOnTop: next });
  }
  return settings;
}

function popupOpacityMenu() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const settings = loadSettings();
  const currentPct = Math.round(clampOpacity(settings.opacity) * 100);
  const levels = [100, 90, 80, 70, 60, 50, 40, 30, 20];
  const menu = Menu.buildFromTemplate([
    { label: 'Opacity', enabled: false },
    { type: 'separator' },
    ...levels.map((pct) => ({
      label: `${pct}%`,
      type: 'radio',
      checked: currentPct === pct,
      click: () => {
        applySettings({ opacity: pct / 100 });
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('settings:opacity', { opacity: pct / 100 });
        }
      },
    })),
  ]);
  menu.popup({ window: mainWindow });
}

function showMainWindow(options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (options.expand) setCompactMode(false);
  if (mainWindow.isMinimized()) mainWindow.restore();
  // Hotkey/tray show must be interactive — click-through would look "broken".
  setClickThrough(false);
  mainWindow.show();
  enforceAlwaysOnTop();
  try {
    mainWindow.moveTop();
  } catch (_) {
    /* ignore */
  }
  mainWindow.focus();
}

function toggleMainWindowVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  const open = mainWindow.isVisible() && !mainWindow.isMinimized();
  // Only hide when already frontmost; otherwise bring to front (common tray-app UX).
  if (open && mainWindow.isFocused()) {
    setClickThrough(false);
    mainWindow.hide();
    return;
  }
  showMainWindow();
}

function normalizeToggleHotkey(raw) {
  if (raw == null) return '';
  const accel = String(raw).trim();
  if (!accel) return '';
  // Reject bare keys without a modifier — too easy to steal typing.
  const hasMod = /CommandOrControl|Command|Control|Ctrl|Alt|Option|Shift|Super|Meta/i.test(accel);
  if (!hasMod) return null;
  return accel;
}

function unregisterToggleHotkey() {
  if (!registeredToggleHotkey) return;
  try {
    globalShortcut.unregister(registeredToggleHotkey);
  } catch (_) {
    /* ignore */
  }
  registeredToggleHotkey = null;
}

function registerToggleHotkey(raw) {
  const normalized = normalizeToggleHotkey(raw);
  if (normalized === null) {
    return { ok: false, error: 'Add Ctrl, Alt, or Shift plus a key' };
  }

  unregisterToggleHotkey();
  if (!normalized) {
    return { ok: true, accelerator: '' };
  }

  // Don't collide with the built-in pin shortcut.
  if (/^CommandOrControl\+Shift\+P$/i.test(normalized)) {
    return { ok: false, error: 'Ctrl+Shift+P is reserved for Pin' };
  }

  try {
    const ok = globalShortcut.register(normalized, () => toggleMainWindowVisibility());
    if (!ok) {
      return { ok: false, error: 'Hotkey is already used by another app' };
    }
    registeredToggleHotkey = normalized;
    return { ok: true, accelerator: normalized };
  } catch (err) {
    return { ok: false, error: err?.message || 'Invalid hotkey' };
  }
}

function syncToggleHotkeyFromSettings(settings = loadSettings()) {
  const result = registerToggleHotkey(settings.toggleHotkey || '');
  if (!result.ok) {
    // Keep settings value but leave unregistered; user can pick another.
    console.warn('toggle hotkey failed:', result.error);
  }
  return result;
}

function isOriginCompactMethod(settings = loadSettings()) {
  return settings.compactMethod !== 'hover';
}

function getWindowDisplay() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const [x, y] = mainWindow.getPosition();
  const [w, h] = mainWindow.getSize();
  return screen.getDisplayNearestPoint({
    x: x + Math.round(w / 2),
    y: y + Math.round(h / 2),
  });
}

/** Keep DIP size stable when Windows DPI-scales the window across monitors. */
function enforceLogicalWindowSize() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const settings = loadSettings();
  if (settings.compactMode) {
    const compact = getCompactSize(settings);
    const mins = getCompactMinSize(settings);
    mainWindow.setMinimumSize(mins.width, mins.height);
    mainWindow.setMaximumSize(MAX_WIDTH, MAX_HEIGHT);
    mainWindow.setSize(compact.width, compact.height);
    if (isOriginCompactMethod(settings)) placeCompactAtRightEnd();
    return;
  }
  const width = clamp(Number(settings.width) || FIRST_WIDTH, MIN_WIDTH, MAX_WIDTH);
  const height = clamp(Number(settings.height) || FIRST_HEIGHT, MIN_HEIGHT, MAX_HEIGHT);
  mainWindow.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
  mainWindow.setMaximumSize(MAX_WIDTH, MAX_HEIGHT);
  mainWindow.setSize(width, height);
}

function getCompactSize(settings = loadSettings()) {
  if (isOriginCompactMethod(settings)) {
    return { width: COMPACT_ORIGIN_WIDTH, height: COMPACT_ORIGIN_HEIGHT };
  }
  const originW = clamp(Number(settings.width) || FIRST_WIDTH, MIN_WIDTH, MAX_WIDTH);
  const width = clamp(Math.round(originW * 0.75), COMPACT_HOVER_MIN_WIDTH, MAX_WIDTH);
  return { width, height: COMPACT_HOVER_HEIGHT };
}

function getCompactMinSize(settings = loadSettings()) {
  if (isOriginCompactMethod(settings)) {
    return { width: COMPACT_ORIGIN_MIN_WIDTH, height: COMPACT_ORIGIN_MIN_HEIGHT };
  }
  return { width: COMPACT_HOVER_MIN_WIDTH, height: COMPACT_HOVER_MIN_HEIGHT };
}

function placeCompactAtRightEnd() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const display = screen.getPrimaryDisplay().workArea;
  const { width, height } = getCompactSize();
  const x = display.x + display.width - width - 6;
  const y = display.y + display.height - height - 6;
  mainWindow.setPosition(x, y);
}

function refreshCompactWindowSize() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const settings = loadSettings();
  if (!settings.compactMode) return;
  const compact = getCompactSize(settings);
  const mins = getCompactMinSize(settings);
  mainWindow.setMinimumSize(mins.width, mins.height);
  mainWindow.setSize(compact.width, compact.height);
  if (isOriginCompactMethod(settings)) placeCompactAtRightEnd();
}

/** Expand for an alert and remember whether we left compact mode (for auto-return). */
function expandForAlertFromMain() {
  const wasCompact = !!loadSettings().compactMode;
  setClickThrough(false);
  showMainWindow({ expand: true });
  return wasCompact;
}

function notifyCompactMode(compact) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window:compact', { compact: !!compact });
  }
}

function setCompactMode(enabled) {
  const want = !!enabled;
  if (!mainWindow || mainWindow.isDestroyed()) {
    const next = saveSettings({ compactMode: want });
    return next;
  }

  const settings = loadSettings();
  if (want) {
    if (!settings.compactMode) {
      const [w, h] = mainWindow.getSize();
      const [px, py] = mainWindow.getPosition();
      saveSettings({
        compactMode: true,
        width: clamp(w, MIN_WIDTH, MAX_WIDTH),
        height: clamp(h, MIN_HEIGHT, MAX_HEIGHT),
        x: px,
        y: py,
      });
    } else {
      saveSettings({ compactMode: true });
    }
    const compact = getCompactSize(loadSettings());
    const mins = getCompactMinSize(loadSettings());
    mainWindow.setMinimumSize(mins.width, mins.height);
    mainWindow.setMaximumSize(MAX_WIDTH, MAX_HEIGHT);
    mainWindow.setSize(compact.width, compact.height);
    if (isOriginCompactMethod(loadSettings())) placeCompactAtRightEnd();
    mainWindow.setOpacity(clampOpacity(loadSettings().opacity));
  } else {
    const next = saveSettings({ compactMode: false });
    mainWindow.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
    mainWindow.setMaximumSize(MAX_WIDTH, MAX_HEIGHT);
    const width = clamp(next.width || FIRST_WIDTH, MIN_WIDTH, MAX_WIDTH);
    const height = clamp(next.height || FIRST_HEIGHT, MIN_HEIGHT, MAX_HEIGHT);
    mainWindow.setSize(width, height);
    // Restore expanded position (saved when entering compact), keep on-screen.
    const display = screen.getPrimaryDisplay().workArea;
    let x = Number.isFinite(next.x) ? next.x : display.x + display.width - width - 24;
    let y = Number.isFinite(next.y) ? next.y : display.y + 24;
    x = clamp(x, display.x, display.x + display.width - width);
    y = clamp(y, display.y, display.y + display.height - height);
    mainWindow.setPosition(x, y);
    mainWindow.setOpacity(clampOpacity(next.opacity));
  }

  notifyCompactMode(want);
  syncClickThroughFromSettings();
  return loadSettings();
}

function currentDayNumber() {
  const settings = loadSettings();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: settings.timeZone || DEFAULT_TIME_ZONE,
      day: 'numeric',
    }).formatToParts(new Date());
    return Number(parts.find((p) => p.type === 'day')?.value) || new Date().getDate();
  } catch (_) {
    return new Date().getDate();
  }
}

function updateTrayIcon(force = false) {
  if (!tray) return;
  const day = currentDayNumber();
  if (!force && trayDay === day) return;
  trayDay = day;
  try {
    tray.setImage(createDayTrayImage(day));
    tray.setToolTip(`Calendar Gadget — ${day}`);
  } catch (_) {
    /* keep previous icon */
  }
}

function startTrayDayWatch() {
  if (trayDayTimer) clearInterval(trayDayTimer);
  updateTrayIcon(true);
  // Check often enough to flip soon after midnight in the display timezone.
  trayDayTimer = setInterval(() => updateTrayIcon(false), 30000);
}

function openHelpFromTray() {
  showMainWindow({ expand: true });
  if (mainWindow && !mainWindow.isDestroyed()) {
    const send = () => mainWindow.webContents.send('help:open');
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', send);
    } else {
      send();
    }
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Show Calendar',
      click: () => showMainWindow({ expand: true }),
    },
    {
      label: 'Hide Calendar',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
      },
    },
    { type: 'separator' },
    {
      label: 'Help',
      click: () => openHelpFromTray(),
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
  ]);
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  if (tray) return;
  const day = currentDayNumber();
  trayDay = day;
  tray = new Tray(createDayTrayImage(day));
  tray.setToolTip(`Calendar Gadget — ${day}`);
  refreshTrayMenu();
  tray.on('click', () => showMainWindow({ expand: true }));
  tray.on('double-click', () => showMainWindow({ expand: true }));
  startTrayDayWatch();
}

function createWindow() {
  const settings = loadSettings();
  const display = screen.getPrimaryDisplay().workArea;
  const compact = !!settings.compactMode;
  const compactSize = getCompactSize(settings);
  const width = compact
    ? compactSize.width
    : clamp(Number(settings.width) || FIRST_WIDTH, MIN_WIDTH, MAX_WIDTH);
  const height = compact
    ? compactSize.height
    : clamp(Number(settings.height) || FIRST_HEIGHT, MIN_HEIGHT, MAX_HEIGHT);
  const compactMins = getCompactMinSize(settings);
  const minWidth = compact ? compactMins.width : MIN_WIDTH;
  const minHeight = compact ? compactMins.height : MIN_HEIGHT;
  let x = settings.x;
  let y = settings.y;

  if (x == null || y == null) {
    if (compact && isOriginCompactMethod(settings)) {
      x = display.x + display.width - width - 6;
      y = display.y + display.height - height - 6;
    } else if (compact) {
      x = display.x + display.width - width - 24;
      y = display.y + 24;
    } else {
      x = display.x + display.width - width - 24;
      y = display.y + 24;
    }
  } else if (compact && isOriginCompactMethod(settings)) {
    x = display.x + display.width - width - 6;
    y = display.y + display.height - height - 6;
  }

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth,
    minHeight,
    maxWidth: MAX_WIDTH,
    maxHeight: MAX_HEIGHT,
    show: false,
    frame: false,
    transparent: false,
    resizable: true,
    hasShadow: true,
    skipTaskbar: true,
    alwaysOnTop: !!settings.alwaysOnTop,
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

  mainWindow.setMinimumSize(minWidth, minHeight);
  mainWindow.setMaximumSize(MAX_WIDTH, MAX_HEIGHT);
  // Force exact launch size (avoids DPI / leftover bounds drift).
  mainWindow.setSize(width, height);
  enforceAlwaysOnTop();

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setSize(width, height);
    enforceAlwaysOnTop();
    setClickThrough(false);
    mainWindow.show();
    notifyCompactMode(compact);
    const display = getWindowDisplay();
    if (display) lastWindowDisplayId = display.id;
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error('did-fail-load', code, desc, url);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('render-process-gone', details);
    // Recover from a blank/dead renderer.
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      mainWindow.webContents.reload();
    } catch (_) {
      /* ignore */
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  let boundsTimer = null;
  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (suppressingDpiPersist) return;
    const [w, h] = mainWindow.getSize();
    const [px, py] = mainWindow.getPosition();
    if (loadSettings().compactMode) {
      // Origin compact is docked; hover compact may be dragged — save its spot.
      if (!isOriginCompactMethod()) {
        saveSettings({ x: px, y: py });
      }
      return;
    }
    saveSettings({ width: w, height: h, x: px, y: py });
  };
  const schedulePersistBounds = () => {
    if (suppressingDpiPersist) return;
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(persistBounds, 250);
  };

  const handleMovedAcrossDisplays = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const display = getWindowDisplay();
    if (!display) {
      schedulePersistBounds();
      return;
    }
    if (lastWindowDisplayId != null && lastWindowDisplayId !== display.id) {
      // Windows DPI-scaled the window when crossing monitors — restore saved DIP size.
      suppressingDpiPersist = true;
      lastWindowDisplayId = display.id;
      enforceLogicalWindowSize();
      clearTimeout(boundsTimer);
      boundsTimer = setTimeout(() => {
        suppressingDpiPersist = false;
        persistBounds();
      }, 80);
      return;
    }
    lastWindowDisplayId = display.id;
    schedulePersistBounds();
  };

  mainWindow.on('will-resize', (event, newBounds) => {
    const settingsNow = loadSettings();
    const compactNow = !!settingsNow.compactMode;
    const mins = compactNow ? getCompactMinSize(settingsNow) : { width: MIN_WIDTH, height: MIN_HEIGHT };
    const nextW = clamp(newBounds.width, mins.width, MAX_WIDTH);
    const nextH = clamp(newBounds.height, mins.height, MAX_HEIGHT);
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
    if (suppressingDpiPersist) return;
    const settingsNow = loadSettings();
    const compactNow = !!settingsNow.compactMode;
    const mins = compactNow ? getCompactMinSize(settingsNow) : { width: MIN_WIDTH, height: MIN_HEIGHT };
    const [w, h] = mainWindow.getSize();
    const nextW = clamp(w, mins.width, MAX_WIDTH);
    const nextH = clamp(h, mins.height, MAX_HEIGHT);
    if (nextW !== w || nextH !== h) {
      mainWindow.setSize(nextW, nextH);
    }
    schedulePersistBounds();
  });
  mainWindow.on('moved', handleMovedAcrossDisplays);
  mainWindow.on('blur', () => {
    enforceAlwaysOnTop();
    // Restore floating click-through when pinned compact loses focus.
    syncClickThroughFromSettings();
  });
  mainWindow.on('focus', () => {
    enforceAlwaysOnTop();
    // Focused window must receive mouse input.
    setClickThrough(false);
  });
  mainWindow.on('show', () => {
    enforceAlwaysOnTop();
    setClickThrough(false);
  });
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
  if (Object.prototype.hasOwnProperty.call(partial || {}, 'toggleHotkey')) {
    const hotkeyResult = registerToggleHotkey(partial.toggleHotkey);
    if (!hotkeyResult.ok) {
      return { ...loadSettings(), ok: false, hotkeyError: hotkeyResult.error };
    }
    partial = { ...partial, toggleHotkey: hotkeyResult.accelerator };
  }

  const settings = saveSettings(partial);
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (partial.timeZone != null) updateTrayIcon(true);
    return { ...settings, ok: true };
  }

  if (partial.opacity != null) {
    mainWindow.setOpacity(clampOpacity(settings.opacity));
  }
  enforceAlwaysOnTop();
  if (partial.width != null || partial.height != null) {
    if (!settings.compactMode) {
      mainWindow.setSize(settings.width, settings.height);
    }
  }
  if (partial.timeZone != null) updateTrayIcon(true);
  if (Object.prototype.hasOwnProperty.call(partial || {}, 'toggleHotkey')) {
    refreshTrayMenu();
  }
  if (Object.prototype.hasOwnProperty.call(partial || {}, 'compactMethod')) {
    refreshCompactWindowSize();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings:compact-method', {
        compactMethod: settings.compactMethod,
      });
    }
  }

  return { ...settings, ok: true };
}

function ensureAutoLaunch() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
  });
}

function clearHourMilestoneTimers() {
  for (const t of hourMilestoneTimers) clearTimeout(t);
  hourMilestoneTimers = [];
  if (thirtyMinuteTimer) {
    clearTimeout(thirtyMinuteTimer);
    thirtyMinuteTimer = null;
  }
}

function clearAlarmWatch() {
  if (alarmTimer) {
    clearTimeout(alarmTimer);
    alarmTimer = null;
  }
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  clearHourMilestoneTimers();
}

function getFiredHourMilestones(settings = loadSettings()) {
  return Array.isArray(settings.hourMilestonesFired)
    ? settings.hourMilestonesFired.map(Number).filter((n) => n >= 1)
    : [];
}

function getUpcomingHourMarks(targetMs, createdMs, fired) {
  const firedSet = new Set(fired);
  const remainingAtSet = targetMs - (Number.isFinite(createdMs) ? createdMs : Date.now());
  const marks = [];
  for (let h = 1; h * HOUR_MS < remainingAtSet; h += 1) {
    if (!firedSet.has(h)) marks.push(h);
  }
  return marks;
}

function fireHourMilestone(hours) {
  const settings = loadSettings();
  if (!settings.targetTime || settings.targetAlarmHandled || alarmActive) return;
  const h = Number(hours);
  if (!Number.isFinite(h) || h < 1) return;

  const fired = getFiredHourMilestones(settings);
  if (fired.includes(h)) return;

  const targetMs = Date.parse(settings.targetTime);
  if (!Number.isFinite(targetMs)) return;
  const remainingMs = targetMs - Date.now();
  // Must have reached/passed this hour mark, but not the final target.
  if (remainingMs > h * HOUR_MS) return;
  if (remainingMs <= 0) return;

  saveSettings({ hourMilestonesFired: [...fired, h] });
  const resumeCompact = expandForAlertFromMain();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hour:milestone', { hours: h, resumeCompact });
  }
}

function checkHourMilestones() {
  const settings = loadSettings();
  if (!settings.targetTime || settings.targetAlarmHandled || alarmActive) return;

  const targetMs = Date.parse(settings.targetTime);
  const createdMs = settings.targetCreatedAt ? Date.parse(settings.targetCreatedAt) : NaN;
  if (!Number.isFinite(targetMs)) return;

  const fired = getFiredHourMilestones(settings);
  const marks = getUpcomingHourMarks(targetMs, createdMs, fired);
  const remainingMs = targetMs - Date.now();
  if (remainingMs <= 0) return;

  for (const h of marks) {
    if (remainingMs <= h * HOUR_MS) {
      fireHourMilestone(h);
    }
  }
}

function fireThirtyMinuteMilestone() {
  const settings = loadSettings();
  if (!settings.targetTime || settings.targetAlarmHandled || alarmActive) return;
  if (settings.thirtyMinuteFired) return;

  const targetMs = Date.parse(settings.targetTime);
  if (!Number.isFinite(targetMs)) return;
  const remainingMs = targetMs - Date.now();
  if (remainingMs > THIRTY_MIN_MS) return;
  if (remainingMs <= 0) return;

  // Only if target was set with more than 30 minutes remaining.
  const createdMs = settings.targetCreatedAt ? Date.parse(settings.targetCreatedAt) : NaN;
  const remainingAtSet = targetMs - (Number.isFinite(createdMs) ? createdMs : targetMs);
  if (remainingAtSet <= THIRTY_MIN_MS) return;

  saveSettings({ thirtyMinuteFired: true });
  const resumeCompact = expandForAlertFromMain();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('thirty:milestone', { resumeCompact });
  }
}

function checkThirtyMinuteMilestone() {
  const settings = loadSettings();
  if (!settings.targetTime || settings.targetAlarmHandled || alarmActive) return;
  if (settings.thirtyMinuteFired) return;

  const targetMs = Date.parse(settings.targetTime);
  if (!Number.isFinite(targetMs)) return;
  const remainingMs = targetMs - Date.now();
  if (remainingMs <= 0) return;
  if (remainingMs <= THIRTY_MIN_MS) {
    fireThirtyMinuteMilestone();
  }
}

function scheduleThirtyMinuteMilestone() {
  if (thirtyMinuteTimer) {
    clearTimeout(thirtyMinuteTimer);
    thirtyMinuteTimer = null;
  }
  const settings = loadSettings();
  if (!settings.targetTime || settings.targetAlarmHandled || settings.thirtyMinuteFired) return;

  const targetMs = Date.parse(settings.targetTime);
  const createdMs = settings.targetCreatedAt ? Date.parse(settings.targetCreatedAt) : Date.now();
  if (!Number.isFinite(targetMs)) return;

  const remainingAtSet = targetMs - createdMs;
  if (remainingAtSet <= THIRTY_MIN_MS) return;

  checkThirtyMinuteMilestone();
  if (loadSettings().thirtyMinuteFired) return;

  const delay = targetMs - THIRTY_MIN_MS - Date.now();
  if (delay <= 0) {
    fireThirtyMinuteMilestone();
    return;
  }
  if (delay >= MAX_TIMEOUT_MS) return;
  thirtyMinuteTimer = setTimeout(() => fireThirtyMinuteMilestone(), delay);
}

function scheduleHourMilestones() {
  clearHourMilestoneTimers();
  const settings = loadSettings();
  if (!settings.targetTime || settings.targetAlarmHandled) return;

  const targetMs = Date.parse(settings.targetTime);
  const createdMs = settings.targetCreatedAt ? Date.parse(settings.targetCreatedAt) : Date.now();
  if (!Number.isFinite(targetMs)) return;

  checkHourMilestones();

  for (const h of getUpcomingHourMarks(targetMs, createdMs, getFiredHourMilestones())) {
    const fireAt = targetMs - h * HOUR_MS;
    const delay = fireAt - Date.now();
    if (delay <= 0) {
      fireHourMilestone(h);
      continue;
    }
    if (delay >= MAX_TIMEOUT_MS) continue;
    hourMilestoneTimers.push(setTimeout(() => fireHourMilestone(h), delay));
  }

  scheduleThirtyMinuteMilestone();
}

function getTargetState() {
  const settings = loadSettings();
  const targetMs = settings.targetTime ? Date.parse(settings.targetTime) : NaN;
  const createdMs = settings.targetCreatedAt ? Date.parse(settings.targetCreatedAt) : NaN;
  const hasTarget = Number.isFinite(targetMs);
  const remainingMs = hasTarget ? Math.max(0, targetMs - Date.now()) : 0;
  const totalMs =
    hasTarget && Number.isFinite(createdMs) && targetMs > createdMs
      ? targetMs - createdMs
      : remainingMs || 1;
  const reached = hasTarget && Date.now() >= targetMs;
  return {
    targetTime: settings.targetTime || null,
    targetCreatedAt: settings.targetCreatedAt || null,
    targetAlarmHandled: !!settings.targetAlarmHandled,
    hasTarget,
    remainingMs,
    totalMs,
    reached,
    alarmActive,
  };
}

function triggerAlarm() {
  const settings = loadSettings();
  if (!settings.targetTime || settings.targetAlarmHandled || alarmActive) return;
  if (Date.now() < Date.parse(settings.targetTime)) return;

  alarmActive = true;
  clearAlarmWatch();
  saveSettings({ targetAlarmHandled: true });
  const resumeCompact = expandForAlertFromMain();
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.flashFrame(true);
    } catch (_) {
      /* ignore */
    }
    mainWindow.webContents.send('alarm:triggered', {
      targetTime: settings.targetTime,
      resumeCompact,
    });
  }

  if (Notification.isSupported()) {
    const note = new Notification({
      title: 'Target Time Reached',
      body: 'Your target time has been reached.',
      silent: false,
    });
    note.on('click', () => showMainWindow({ expand: true }));
    note.show();
  }
}

function checkTargetAlarm() {
  const settings = loadSettings();
  if (!settings.targetTime || settings.targetAlarmHandled) return;
  if (Date.now() >= Date.parse(settings.targetTime)) {
    triggerAlarm();
  }
}

function scheduleAlarmWatch() {
  clearAlarmWatch();
  const settings = loadSettings();
  if (!settings.targetTime || settings.targetAlarmHandled) return;

  checkTargetAlarm();
  if (alarmActive || loadSettings().targetAlarmHandled) return;

  const delay = Date.parse(settings.targetTime) - Date.now();
  if (delay <= 0) {
    triggerAlarm();
    return;
  }

  // Precise wake near the target; interval covers sleep/missed timeouts.
  if (delay < MAX_TIMEOUT_MS) {
    alarmTimer = setTimeout(() => checkTargetAlarm(), delay);
  }
  alarmInterval = setInterval(() => {
    checkTargetAlarm();
    checkHourMilestones();
    checkThirtyMinuteMilestone();
  }, 20000);

  scheduleHourMilestones();
}

function setTargetTime(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { ok: false, error: 'Invalid date/time' };
  if (ms <= Date.now()) return { ok: false, error: 'Choose a future date and time' };

  alarmActive = false;
  saveSettings({
    targetTime: new Date(ms).toISOString(),
    targetCreatedAt: new Date().toISOString(),
    targetAlarmHandled: false,
    hourMilestonesFired: [],
    thirtyMinuteFired: false,
  });
  scheduleAlarmWatch();
  refreshCompactWindowSize();
  return { ok: true, ...getTargetState() };
}

function clearTargetTime() {
  alarmActive = false;
  clearAlarmWatch();
  saveSettings({
    targetTime: null,
    targetCreatedAt: null,
    targetAlarmHandled: false,
    hourMilestonesFired: [],
    thirtyMinuteFired: false,
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.flashFrame(false);
    } catch (_) {
      /* ignore */
    }
    mainWindow.webContents.send('alarm:stopped');
    mainWindow.webContents.send('hour:milestone-clear');
    mainWindow.webContents.send('thirty:milestone-clear');
  }
  syncClickThroughFromSettings();
  refreshCompactWindowSize();
  return { ok: true, ...getTargetState() };
}

function dismissAlarm() {
  alarmActive = false;
  clearAlarmWatch();
  saveSettings({
    targetTime: null,
    targetCreatedAt: null,
    targetAlarmHandled: false,
    hourMilestonesFired: [],
    thirtyMinuteFired: false,
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.flashFrame(false);
    } catch (_) {
      /* ignore */
    }
    mainWindow.webContents.send('hour:milestone-clear');
    mainWindow.webContents.send('thirty:milestone-clear');
  }
  syncClickThroughFromSettings();
  refreshCompactWindowSize();
  // Structured for future snooze: caller can setTargetTime(now + snoozeMs) instead of clear.
  return { ok: true, ...getTargetState() };
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.calendar.gadget');
    }
    ensureAutoLaunch();
    createTray();
    createWindow();
    scheduleAlarmWatch();
    try {
      syncToggleHotkeyFromSettings();
    } catch (err) {
      console.warn('toggle hotkey setup failed:', err);
    }
    try {
      globalShortcut.register('CommandOrControl+Shift+P', () => {
        toggleAlwaysOnTop();
      });
    } catch (err) {
      console.warn('pin hotkey setup failed:', err);
    }

    powerMonitor.on('resume', () => {
      // After sleep, compare immediately — fire if target passed while asleep.
      checkTargetAlarm();
      checkHourMilestones();
      checkThirtyMinuteMilestone();
      scheduleAlarmWatch();
      updateTrayIcon(true);
    });

    // Undo Windows DPI window growth when monitor scale metrics change.
    screen.on('display-metrics-changed', (_event, _display, changedMetrics) => {
      if (!changedMetrics || !changedMetrics.includes('scaleFactor')) return;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      suppressingDpiPersist = true;
      enforceLogicalWindowSize();
      setTimeout(() => {
        suppressingDpiPersist = false;
        const display = getWindowDisplay();
        if (display) lastWindowDisplayId = display.id;
      }, 80);
    });

    app.on('activate', () => {
      showMainWindow();
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  unregisterToggleHotkey();
  globalShortcut.unregisterAll();
  clearAlarmWatch();
  if (trayDayTimer) {
    clearInterval(trayDayTimer);
    trayDayTimer = null;
  }
});

app.on('window-all-closed', () => {
  // Keep running in the system tray on Windows/Linux.
  if (process.platform === 'darwin') app.quit();
});

ipcMain.handle('settings:get', () => ({
  ...loadSettings(),
  limits: { minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT, maxWidth: MAX_WIDTH, maxHeight: MAX_HEIGHT },
  target: getTargetState(),
}));

ipcMain.handle('settings:set', (_event, partial) => applySettings(partial || {}));

ipcMain.handle('target:get', () => getTargetState());
ipcMain.handle('target:set', (_event, iso) => setTargetTime(iso));
ipcMain.handle('target:clear', () => clearTargetTime());
ipcMain.handle('alarm:dismiss', () => dismissAlarm());

ipcMain.handle('window:minimize', () => {
  const next = !loadSettings().compactMode;
  return setCompactMode(next);
});

ipcMain.handle('window:setCompact', (_event, compact) => setCompactMode(!!compact));

ipcMain.handle('window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
});

ipcMain.handle('window:show', () => {
  showMainWindow();
});

ipcMain.handle('window:getPosition', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { x: 0, y: 0 };
  const [x, y] = mainWindow.getPosition();
  return { x, y };
});

ipcMain.handle('window:setPosition', (_event, x, y) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const nextX = Math.round(Number(x));
  const nextY = Math.round(Number(y));
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;
  mainWindow.setPosition(nextX, nextY);
});

ipcMain.handle('window:togglePin', () => toggleAlwaysOnTop());

ipcMain.handle('window:setClickThrough', () => {
  const clickThrough = syncClickThroughFromSettings();
  return { ok: true, clickThrough };
});

ipcMain.handle('menu:opacity', () => {
  popupOpacityMenu();
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
