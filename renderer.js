const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const els = {
  shell: document.querySelector('.shell'),
  appToast: document.getElementById('app-toast'),
  content: document.querySelector('.content'),
  clockBlock: document.querySelector('.clock-block'),
  clockTime: document.getElementById('clock-time'),
  clockDate: document.getElementById('clock-date'),
  compactRemaining: document.getElementById('compact-remaining'),
  monthLabel: document.getElementById('month-label'),
  weekdayRow: document.getElementById('weekday-row'),
  dayGrid: document.getElementById('day-grid'),
  calendarBlock: document.querySelector('.calendar-block'),
  prevMonth: document.getElementById('prev-month'),
  nextMonth: document.getElementById('next-month'),
  btnToday: document.getElementById('btn-today'),
  btnTarget: document.getElementById('btn-target'),
  btnSettings: document.getElementById('btn-settings'),
  btnSettingsClose: document.getElementById('btn-settings-close'),
  btnMinimize: document.getElementById('btn-minimize'),
  btnClose: document.getElementById('btn-close'),
  settingsPanel: document.getElementById('settings-panel'),
  schedulePanel: document.getElementById('schedule-panel'),
  targetPanel: document.getElementById('target-panel'),
  remainingPanel: document.getElementById('remaining-panel'),
  alarmPanel: document.getElementById('alarm-panel'),
  helpPanel: document.getElementById('help-panel'),
  btnHelpClose: document.getElementById('btn-help-close'),
  hourMilestoneOverlay: document.getElementById('hour-milestone-overlay'),
  hourMilestoneMessage: document.getElementById('hour-milestone-message'),
  thirtyMilestoneOverlay: document.getElementById('thirty-milestone-overlay'),
  thirtyMilestoneMessage: document.getElementById('thirty-milestone-message'),
  fireworksCanvas: document.getElementById('fireworks-canvas'),
  targetForm: document.getElementById('target-form'),
  targetDatetime: document.getElementById('target-datetime'),
  targetWheels: document.getElementById('target-wheels'),
  targetTimezoneHint: document.getElementById('target-timezone-hint'),
  targetError: document.getElementById('target-error'),
  btnTargetClose: document.getElementById('btn-target-close'),
  remainingValue: document.getElementById('remaining-value'),
  remainingTarget: document.getElementById('remaining-target'),
  remainingRing: document.getElementById('remaining-ring'),
  btnRemainingClose: document.getElementById('btn-remaining-close'),
  btnClearTarget: document.getElementById('btn-clear-target'),
  alarmTargetLabel: document.getElementById('alarm-target-label'),
  btnAlarmDismiss: document.getElementById('btn-alarm-dismiss'),
  scheduleDateLabel: document.getElementById('schedule-date-label'),
  scheduleList: document.getElementById('schedule-list'),
  scheduleForm: document.getElementById('schedule-form'),
  scheduleTitle: document.getElementById('schedule-title'),
  scheduleNotes: document.getElementById('schedule-notes'),
  scheduleError: document.getElementById('schedule-error'),
  btnScheduleClose: document.getElementById('btn-schedule-close'),
  opacityRange: document.getElementById('opacity-range'),
  opacityValue: document.getElementById('opacity-value'),
  weekStart: document.getElementById('week-start'),
  compactMethodOrigin: document.getElementById('compact-method-origin'),
  compactMethodHover: document.getElementById('compact-method-hover'),
  hotkeyCapture: document.getElementById('hotkey-capture'),
  hotkeyClear: document.getElementById('hotkey-clear'),
  hotkeyHint: document.getElementById('hotkey-hint'),
  hotkeyError: document.getElementById('hotkey-error'),
  sizeWidth: document.getElementById('size-width'),
  sizeHeight: document.getElementById('size-height'),
  sizeHint: document.getElementById('size-hint'),
  applySize: document.getElementById('apply-size'),
  timezoneFilter: document.getElementById('timezone-filter'),
  timezone: document.getElementById('timezone'),
  timezoneField: document.querySelector('.timezone-field'),
};

let settings = {
  opacity: 0.92,
  weekStartsOn: 0,
  alwaysOnTop: true,
  timeZone: 'America/New_York',
  width: 260,
  height: 360,
  compactMode: false,
  compactMethod: 'origin',
};

let limits = {
  minWidth: 260,
  minHeight: 360,
  maxWidth: 420,
  maxHeight: 600,
};

let allTimeZones = [];
let scheduleDates = new Set();
let selectedDate = null;
let viewYear;
let viewMonth; // 0-11
let clockTimer = null;
let targetState = {
  targetTime: null,
  targetCreatedAt: null,
  targetAlarmHandled: false,
  hasTarget: false,
  remainingMs: 0,
  totalMs: 1,
  reached: false,
  alarmActive: false,
};
let remainingLiveTimer = null;
let alarmAudio = null;
let hourMilestoneTimer = null;
let hourChimeAudio = null;
let thirtyMilestoneTimer = null;
let fireworksRaf = null;
let fireworksParticles = [];
let fireworksLastSpawn = 0;
/** True when an alert expanded the window from compact; restore compact when the alert ends. */
let resumeCompactAfterAlert = false;

function isHoverCompactMethod() {
  return settings.compactMethod === 'hover';
}

function nowInZone() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: settings.timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    weekday: 'long',
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(get('minute'));
  const second = Number(get('second'));
  const weekday = get('weekday');

  return { year, month, day, hour, minute, second, weekday };
}

function formatTargetLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: settings.timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function formatCountdownHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function formatTargetClock(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: settings.timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function updateRemainingRing(remainingMs, totalMs) {
  if (!els.remainingRing) return;
  const total = Math.max(1, totalMs || 1);
  const progress = Math.min(1, Math.max(0, remainingMs / total));
  els.remainingRing.style.strokeDasharray = String(RING_CIRCUMFERENCE);
  els.remainingRing.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));
}

function formatRemaining(ms) {
  return formatCountdownHMS(ms);
}

function getZonedDateTimeParts(date, timeZone = settings.timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

/** Wall-clock `YYYY-MM-DDTHH:mm` in the selected display timezone. */
function toDatetimeLocalValue(date, timeZone = settings.timeZone) {
  const p = getZonedDateTimeParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Interpret a datetime-local string as wall time in `timeZone` and return UTC ms.
 * datetime-local has no zone; the browser would otherwise treat it as computer local.
 */
function zonedDatetimeLocalToUtcMs(value, timeZone = settings.timeZone) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return NaN;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] || 0);
  const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = wantedAsUtc;
  for (let i = 0; i < 3; i++) {
    const shown = getZonedDateTimeParts(new Date(guess), timeZone);
    const shownAsUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second
    );
    guess += wantedAsUtc - shownAsUtc;
  }
  return guess;
}

function formatTimezoneLabel(tz = settings.timeZone) {
  return String(tz || 'UTC').replace(/_/g, ' ');
}

const WHEEL_ITEM_H = 32;
const WHEEL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function createWheelColumn(colEl, { key, label, values, onChange }) {
  colEl.innerHTML = '';
  colEl.dataset.wheel = key;

  const caption = document.createElement('div');
  caption.className = 'wheel-col-label';
  caption.textContent = label;
  colEl.appendChild(caption);

  const padTop = document.createElement('div');
  padTop.className = 'wheel-pad';
  padTop.setAttribute('aria-hidden', 'true');
  colEl.appendChild(padTop);

  const listHost = document.createElement('div');
  listHost.className = 'wheel-list';
  colEl.appendChild(listHost);

  const padBottom = document.createElement('div');
  padBottom.className = 'wheel-pad';
  padBottom.setAttribute('aria-hidden', 'true');
  colEl.appendChild(padBottom);

  let items = values.slice();
  let index = 0;
  let suppressScroll = false;
  let scrollTimer = null;

  function clampIndex(i) {
    return Math.max(0, Math.min(items.length - 1, i));
  }

  function renderItems() {
    listHost.innerHTML = items
      .map(
        (it, i) =>
          `<button type="button" class="wheel-item${i === index ? ' is-selected' : ''}" data-index="${i}">${it.label}</button>`
      )
      .join('');
  }

  function markSelected() {
    listHost.querySelectorAll('.wheel-item').forEach((el, idx) => {
      el.classList.toggle('is-selected', idx === index);
    });
  }

  function indexFromScroll() {
    return clampIndex(Math.round(colEl.scrollTop / WHEEL_ITEM_H));
  }

  function scrollToIndex(i, { animate = false, silent = false } = {}) {
    index = clampIndex(i);
    suppressScroll = true;
    const top = index * WHEEL_ITEM_H;
    if (animate && typeof colEl.scrollTo === 'function') {
      colEl.scrollTo({ top, behavior: 'smooth' });
    } else {
      colEl.scrollTop = top;
    }
    markSelected();
    // Release suppress after layout/paint so scroll handlers don't echo.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressScroll = false;
      });
    });
    if (!silent && typeof onChange === 'function') onChange(items[index]?.value, key);
  }

  function commitFromScroll({ silent = false } = {}) {
    const next = indexFromScroll();
    index = next;
    markSelected();
    if (silent || suppressScroll) return;
    if (typeof onChange === 'function') onChange(items[index]?.value, key);
  }

  function onScroll() {
    if (suppressScroll) return;
    const next = indexFromScroll();
    if (next !== index) {
      index = next;
      markSelected();
    }
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      scrollTimer = null;
      if (suppressScroll) return;
      commitFromScroll({ silent: false });
    }, 80);
  }

  function onScrollEnd() {
    if (suppressScroll) return;
    if (scrollTimer) {
      clearTimeout(scrollTimer);
      scrollTimer = null;
    }
    commitFromScroll({ silent: false });
  }

  function onClick(e) {
    const btn = e.target.closest('.wheel-item');
    if (!btn) return;
    e.preventDefault();
    const i = Number(btn.dataset.index);
    if (!Number.isFinite(i)) return;
    scrollToIndex(i, { animate: true, silent: false });
  }

  function onWheel(e) {
    // Keep scrolling inside the column; don't move the overlay panel.
    e.stopPropagation();
  }

  colEl.addEventListener('scroll', onScroll, { passive: true });
  colEl.addEventListener('scrollend', onScrollEnd);
  listHost.addEventListener('click', onClick);
  colEl.addEventListener('wheel', onWheel, { passive: true });

  renderItems();
  colEl.scrollTop = 0;

  return {
    key,
    setValues(nextValues, preferredValue) {
      const prev = items[index]?.value;
      items = nextValues.slice();
      renderItems();
      let nextIndex = items.findIndex((it) => it.value === preferredValue);
      if (nextIndex < 0) nextIndex = items.findIndex((it) => it.value === prev);
      if (nextIndex < 0) nextIndex = Math.min(index, items.length - 1);
      scrollToIndex(Math.max(0, nextIndex), { animate: false, silent: true });
    },
    setValue(value, opts = {}) {
      const i = items.findIndex((it) => it.value === value);
      scrollToIndex(i < 0 ? 0 : i, { animate: false, silent: true, ...opts });
    },
    getValue() {
      return items[index]?.value;
    },
  };
}

function createAlarmWheelPicker(root) {
  if (!root) return null;
  const yearCol = root.querySelector('[data-wheel="year"]');
  const monthCol = root.querySelector('[data-wheel="month"]');
  const dayCol = root.querySelector('[data-wheel="day"]');
  const hourCol = root.querySelector('[data-wheel="hour"]');
  const minuteCol = root.querySelector('[data-wheel="minute"]');
  if (!yearCol || !monthCol || !dayCol || !hourCol || !minuteCol) return null;

  let year = new Date().getFullYear();
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let columns = null;

  function syncHidden() {
    if (!els.targetDatetime) return;
    els.targetDatetime.value = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
  }

  function dayValues(y, m) {
    const n = daysInMonth(y, m);
    return Array.from({ length: n }, (_, i) => {
      const d = i + 1;
      return { value: d, label: String(d) };
    });
  }

  function rebuildDays({ silent } = {}) {
    const maxDay = daysInMonth(year, month);
    if (day > maxDay) day = maxDay;
    columns.day.setValues(dayValues(year, month), day);
    if (!silent) syncHidden();
  }

  function onChange(value, key) {
    if (key === 'year') year = Number(value);
    if (key === 'month') month = Number(value);
    if (key === 'day') day = Number(value);
    if (key === 'hour') hour = Number(value);
    if (key === 'minute') minute = Number(value);
    if (key === 'year' || key === 'month') rebuildDays();
    else syncHidden();
  }

  const nowYear = getZonedDateTimeParts(new Date()).year;
  const years = Array.from({ length: 11 }, (_, i) => {
    const y = nowYear + i;
    return { value: y, label: String(y) };
  });
  const months = WHEEL_MONTHS.map((name, i) => ({ value: i + 1, label: name }));
  const hours = Array.from({ length: 24 }, (_, i) => ({ value: i, label: pad(i) }));
  const minutes = Array.from({ length: 60 }, (_, i) => ({ value: i, label: pad(i) }));

  columns = {
    year: createWheelColumn(yearCol, { key: 'year', label: 'Year', values: years, onChange }),
    month: createWheelColumn(monthCol, { key: 'month', label: 'Month', values: months, onChange }),
    day: createWheelColumn(dayCol, { key: 'day', label: 'Day', values: dayValues(nowYear, 1), onChange }),
    hour: createWheelColumn(hourCol, { key: 'hour', label: 'Hour', values: hours, onChange }),
    minute: createWheelColumn(minuteCol, { key: 'minute', label: 'Min', values: minutes, onChange }),
  };

  return {
    setFromDate(date) {
      const p = getZonedDateTimeParts(date);
      year = p.year;
      month = p.month;
      day = p.day;
      hour = p.hour;
      minute = p.minute;
      // Refresh year list if we're near the edge of the range.
      const y0 = getZonedDateTimeParts(new Date()).year;
      columns.year.setValues(
        Array.from({ length: 11 }, (_, i) => {
          const y = y0 + i;
          return { value: y, label: String(y) };
        }),
        year
      );
      columns.month.setValue(month);
      rebuildDays({ silent: true });
      columns.day.setValue(day);
      columns.hour.setValue(hour);
      columns.minute.setValue(minute);
      syncHidden();
    },
    getValue() {
      syncHidden();
      return els.targetDatetime?.value || '';
    },
  };
}

let alarmWheelPicker = null;

function ensureAlarmWheelPicker() {
  if (alarmWheelPicker) return alarmWheelPicker;
  alarmWheelPicker = createAlarmWheelPicker(els.targetWheels);
  return alarmWheelPicker;
}

function syncTargetButton() {
  if (!els.btnTarget) return;
  els.btnTarget.classList.toggle('has-target', !!targetState.hasTarget && !targetState.reached);
  els.btnTarget.classList.toggle('alarm-ready', !!targetState.reached || !!targetState.alarmActive);
  updateCompactTargetUi();
}

async function refreshTargetState() {
  targetState = await window.calendarApi.getTarget();
  syncTargetButton();
  return targetState;
}

function formatHourMilestoneMessage(hours) {
  const n = Math.max(1, Math.floor(Number(hours) || 1));
  return n === 1 ? '1 Hour Remains!' : `${n} Hours Remain!`;
}

function stopHourChime() {
  if (!hourChimeAudio) return;
  try {
    hourChimeAudio.ctx.close();
  } catch (_) {
    /* ignore */
  }
  hourChimeAudio = null;
}

function playHourChime() {
  stopHourChime();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    gain.connect(ctx.destination);
    const tones = [523.25, 659.25, 783.99];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      const start = ctx.currentTime + i * 0.14;
      osc.start(start);
      osc.stop(start + 0.18);
    });
    hourChimeAudio = { ctx };
    setTimeout(() => stopHourChime(), 800);
  } catch (_) {
    /* ignore */
  }
}

function hideHourMilestone() {
  if (hourMilestoneTimer) {
    clearTimeout(hourMilestoneTimer);
    hourMilestoneTimer = null;
  }
  if (els.hourMilestoneOverlay) els.hourMilestoneOverlay.hidden = true;
  els.shell.classList.remove('hour-celebrate');
  els.remainingPanel.classList.remove('hour-celebrate');
  stopHourChime();
}

function unpinIfNoOverlays() {
  if (
    els.schedulePanel.hidden &&
    els.settingsPanel.hidden &&
    els.targetPanel.hidden &&
    els.remainingPanel.hidden &&
    els.alarmPanel.hidden &&
    (!els.hourMilestoneOverlay || els.hourMilestoneOverlay.hidden) &&
    (!els.thirtyMilestoneOverlay || els.thirtyMilestoneOverlay.hidden)
  ) {
    setToolbarPinned(false);
  }
}

async function expandForAlert(resumeCompactHint) {
  const wasCompact = resumeCompactHint === true || isCompactMode();
  await expandFromCompact();
  if (wasCompact) resumeCompactAfterAlert = true;
  await syncClickThroughMode();
}

async function maybeResumeCompactAfterAlert() {
  if (!resumeCompactAfterAlert) return;
  if (!els.alarmPanel.hidden) return;
  if (els.hourMilestoneOverlay && !els.hourMilestoneOverlay.hidden) return;
  if (els.thirtyMilestoneOverlay && !els.thirtyMilestoneOverlay.hidden) return;
  // User opened another panel — leave them expanded.
  if (
    !els.settingsPanel.hidden ||
    !els.schedulePanel.hidden ||
    !els.targetPanel.hidden ||
    (els.helpPanel && !els.helpPanel.hidden)
  ) {
    resumeCompactAfterAlert = false;
    return;
  }
  if (!els.remainingPanel.hidden) closeTargetOverlays();
  resumeCompactAfterAlert = false;
  setToolbarPinned(false);
  await enterCompactMode();
}

function dismissHourMilestone() {
  hideHourMilestone();
  unpinIfNoOverlays();
  void maybeResumeCompactAfterAlert();
}

function showHourMilestone(hours, resumeCompact) {
  if (!els.hourMilestoneOverlay || !els.hourMilestoneMessage) return;
  void expandForAlert(resumeCompact).then(() => {
    hideThirtyMilestone();
    hideHourMilestone();
    els.hourMilestoneMessage.textContent = formatHourMilestoneMessage(hours);
    els.hourMilestoneOverlay.hidden = false;
    els.shell.classList.add('hour-celebrate');
    if (!els.remainingPanel.hidden) els.remainingPanel.classList.add('hour-celebrate');
    setToolbarPinned(true);
    playHourChime();
    hourMilestoneTimer = setTimeout(() => dismissHourMilestone(), 5000);
  });
}

function stopFireworks() {
  if (fireworksRaf) {
    cancelAnimationFrame(fireworksRaf);
    fireworksRaf = null;
  }
  fireworksParticles = [];
  fireworksLastSpawn = 0;
  if (els.fireworksCanvas) {
    const ctx = els.fireworksCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, els.fireworksCanvas.width, els.fireworksCanvas.height);
  }
}

function resizeFireworksCanvas() {
  if (!els.fireworksCanvas || !els.thirtyMilestoneOverlay) return;
  const rect = els.thirtyMilestoneOverlay.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  els.fireworksCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  els.fireworksCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  els.fireworksCanvas.style.width = `${rect.width}px`;
  els.fireworksCanvas.style.height = `${rect.height}px`;
}

function spawnFireworkBurst(x, y) {
  const colors = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#ffffff', '#ff9f1c', '#b5179e'];
  const count = 32 + Math.floor(Math.random() * 22);
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.25;
    const speed = 1.5 + Math.random() * 3.2;
    fireworksParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.01 + Math.random() * 0.02,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 1.3 + Math.random() * 2.4,
    });
  }
}

function tickFireworks(ts) {
  if (!els.fireworksCanvas || els.thirtyMilestoneOverlay?.hidden) {
    stopFireworks();
    return;
  }
  const ctx = els.fireworksCanvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = els.fireworksCanvas;
  ctx.clearRect(0, 0, width, height);

  if (!fireworksLastSpawn || ts - fireworksLastSpawn > 280) {
    fireworksLastSpawn = ts;
    const x = width * (0.12 + Math.random() * 0.76);
    const y = height * (0.12 + Math.random() * 0.48);
    spawnFireworkBurst(x, y);
    if (Math.random() > 0.45) {
      spawnFireworkBurst(width * (0.2 + Math.random() * 0.6), height * (0.2 + Math.random() * 0.4));
    }
  }

  for (let i = fireworksParticles.length - 1; i >= 0; i -= 1) {
    const p = fireworksParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.038;
    p.life -= p.decay;
    if (p.life <= 0) {
      fireworksParticles.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  fireworksRaf = requestAnimationFrame(tickFireworks);
}

function startFireworks() {
  stopFireworks();
  resizeFireworksCanvas();
  fireworksLastSpawn = 0;
  fireworksRaf = requestAnimationFrame(tickFireworks);
}

function playThirtyFanfare() {
  stopHourChime();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    gain.connect(ctx.destination);
    const tones = [523.25, 659.25, 783.99, 1046.5, 783.99, 1174.66];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      const start = ctx.currentTime + i * 0.1;
      osc.start(start);
      osc.stop(start + 0.22);
    });
    hourChimeAudio = { ctx };
    setTimeout(() => stopHourChime(), 1200);
  } catch (_) {
    /* ignore */
  }
}

function hideThirtyMilestone() {
  if (thirtyMilestoneTimer) {
    clearTimeout(thirtyMilestoneTimer);
    thirtyMilestoneTimer = null;
  }
  if (els.thirtyMilestoneOverlay) els.thirtyMilestoneOverlay.hidden = true;
  els.shell.classList.remove('thirty-celebrate');
  els.remainingPanel.classList.remove('thirty-celebrate');
  stopFireworks();
}

function dismissThirtyMilestone() {
  hideThirtyMilestone();
  // Alert celebration is done — close remaining view and restore compact if needed.
  if (!els.remainingPanel.hidden) closeTargetOverlays();
  unpinIfNoOverlays();
  void maybeResumeCompactAfterAlert();
}

function showThirtyMilestone(resumeCompact) {
  if (!els.thirtyMilestoneOverlay) return;
  void (async () => {
    await expandForAlert(resumeCompact);
    hideHourMilestone();
    hideThirtyMilestone();
    if (els.thirtyMilestoneMessage) {
      els.thirtyMilestoneMessage.textContent = '30 minutes remains!!!';
    }
    if (targetState.hasTarget && !targetState.reached && !targetState.alarmActive) {
      openRemainingPanelContent();
    }
    els.thirtyMilestoneOverlay.hidden = false;
    els.shell.classList.add('thirty-celebrate');
    if (!els.remainingPanel.hidden) els.remainingPanel.classList.add('thirty-celebrate');
    setToolbarPinned(true);
    playThirtyFanfare();
    startFireworks();
    thirtyMilestoneTimer = setTimeout(() => dismissThirtyMilestone(), 8000);
  })();
}

function stopRemainingLive() {
  if (remainingLiveTimer) {
    clearInterval(remainingLiveTimer);
    remainingLiveTimer = null;
  }
}

function updateRemainingView() {
  if (!targetState.hasTarget || !targetState.targetTime) return;
  const remainingMs = Math.max(0, Date.parse(targetState.targetTime) - Date.now());
  const createdMs = targetState.targetCreatedAt ? Date.parse(targetState.targetCreatedAt) : NaN;
  const targetMs = Date.parse(targetState.targetTime);
  const totalMs =
    Number.isFinite(createdMs) && targetMs > createdMs
      ? targetMs - createdMs
      : targetState.totalMs || remainingMs || 1;

  targetState.remainingMs = remainingMs;
  targetState.totalMs = totalMs;
  targetState.reached = remainingMs <= 0;
  els.remainingValue.textContent = formatCountdownHMS(remainingMs);
  els.remainingTarget.textContent = formatTargetClock(targetState.targetTime);
  updateRemainingRing(remainingMs, totalMs);
  els.remainingPanel.classList.toggle('is-danger', remainingMs > 0 && remainingMs < 10000);
}

function closeTargetOverlays() {
  hideHourMilestone();
  hideThirtyMilestone();
  els.targetPanel.hidden = true;
  els.remainingPanel.hidden = true;
  els.remainingPanel.classList.remove('is-danger');
  stopRemainingLive();
  if (els.schedulePanel.hidden && els.settingsPanel.hidden && els.alarmPanel.hidden && (!els.helpPanel || els.helpPanel.hidden)) {
    setToolbarPinned(false);
  }
}

function openTargetPicker() {
  void expandFromCompact().then(() => openTargetPickerContent());
}

function openTargetPickerContent() {
  els.schedulePanel.hidden = true;
  els.settingsPanel.hidden = true;
  els.remainingPanel.hidden = true;
  closeHelp();
  stopRemainingLive();
  els.targetError.hidden = true;
  els.targetError.textContent = '';
  // Round up to next minute in absolute time, then show wall clock in selected TZ.
  const minMs = Math.ceil((Date.now() + 60 * 1000) / 60000) * 60000;
  const picker = ensureAlarmWheelPicker();
  if (picker) picker.setFromDate(new Date(minMs));
  else if (els.targetDatetime) els.targetDatetime.value = toDatetimeLocalValue(new Date(minMs));
  if (els.targetTimezoneHint) {
    els.targetTimezoneHint.textContent = `Times use ${formatTimezoneLabel()}`;
  }
  els.targetPanel.hidden = false;
  setToolbarPinned(true);
}

function openRemainingPanel() {
  void expandFromCompact().then(() => openRemainingPanelContent());
}

function openRemainingPanelContent() {
  els.schedulePanel.hidden = true;
  els.settingsPanel.hidden = true;
  els.targetPanel.hidden = true;
  updateRemainingView();
  els.remainingPanel.hidden = false;
  setToolbarPinned(true);
  stopRemainingLive();
  remainingLiveTimer = setInterval(updateRemainingView, 250);
}

function startAlarmSound() {
  stopAlarmSound();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    gain.connect(ctx.destination);

    const beep = () => {
      if (!alarmAudio) return;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 880;
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    };

    beep();
    const timer = setInterval(beep, 900);
    alarmAudio = { ctx, timer };
  } catch (_) {
    /* audio may be blocked until gesture; alarm UI still shows */
  }
}

function stopAlarmSound() {
  if (!alarmAudio) return;
  clearInterval(alarmAudio.timer);
  try {
    alarmAudio.ctx.close();
  } catch (_) {
    /* ignore */
  }
  alarmAudio = null;
}

function showAlarmPanel(payload) {
  void expandForAlert(payload?.resumeCompact).then(() => {
    hideHourMilestone();
    hideThirtyMilestone();
    const iso = payload?.targetTime || targetState.targetTime;
    els.schedulePanel.hidden = true;
    els.settingsPanel.hidden = true;
    els.targetPanel.hidden = true;
    els.remainingPanel.hidden = true;
    closeHelp();
    stopRemainingLive();
    els.alarmTargetLabel.textContent = `Target: ${formatTargetLabel(iso)}`;
    els.alarmPanel.hidden = false;
    setToolbarPinned(true);
    startAlarmSound();
    syncTargetButton();
  });
}

async function hideAlarmPanel() {
  stopAlarmSound();
  els.alarmPanel.hidden = true;
  await refreshTargetState();
  unpinIfNoOverlays();
  await maybeResumeCompactAfterAlert();
}

async function onTargetButtonClick() {
  await refreshTargetState();
  if (targetState.alarmActive || (targetState.hasTarget && targetState.reached)) {
    showAlarmPanel({ targetTime: targetState.targetTime });
    return;
  }
  if (!targetState.hasTarget) {
    openTargetPicker();
    return;
  }
  openRemainingPanel();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateKey(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function formatDateLabel(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function updateClock() {
  const t = nowInZone();
  els.clockTime.textContent = `${pad(t.hour)}:${pad(t.minute)}:${pad(t.second)}`;
  if (isCompactMode() && !isHoverCompactMethod()) {
    // Origin compact: time only.
    els.clockDate.textContent = `${pad(t.hour)}:${pad(t.minute)}:${pad(t.second)}`;
  } else {
    els.clockDate.textContent = new Intl.DateTimeFormat(undefined, {
      timeZone: settings.timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  }
  updateCompactTargetUi();
}

function isCompactMode() {
  return !!settings.compactMode || els.shell.classList.contains('is-compact');
}

function updateCompactTargetUi() {
  const el = els.compactRemaining;
  if (!el) return;
  const compact = isCompactMode();
  const live =
    compact &&
    targetState.hasTarget &&
    targetState.targetTime &&
    !targetState.reached &&
    !targetState.alarmActive;

  els.shell.classList.toggle('has-compact-target', !!live);
  if (!live) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('is-danger');
    return;
  }

  const remainingMs = Math.max(0, Date.parse(targetState.targetTime) - Date.now());
  targetState.remainingMs = remainingMs;
  targetState.reached = remainingMs <= 0;
  el.hidden = false;
  el.textContent = formatCountdownHMS(remainingMs);
  el.classList.toggle('is-danger', remainingMs > 0 && remainingMs < 10000);
  el.title = `Until ${formatTargetLabel(targetState.targetTime)}`;
}

function renderWeekdays() {
  const names = settings.weekStartsOn === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN;
  els.weekdayRow.innerHTML = names.map((d) => `<div class="weekday">${d}</div>`).join('');
}

async function refreshMonthScheduleMarks() {
  if (viewYear == null || viewMonth == null) return;
  const dates = await window.calendarApi.listScheduleDatesInMonth(viewYear, viewMonth + 1);
  scheduleDates = new Set(dates);
}

async function renderCalendar() {
  const t = nowInZone();
  if (viewYear == null || viewMonth == null) {
    viewYear = t.year;
    viewMonth = t.month - 1;
  }

  els.monthLabel.textContent = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(viewYear, viewMonth, 1)));

  renderWeekdays();
  await refreshMonthScheduleMarks();

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const startOffset = settings.weekStartsOn === 1 ? (firstDow + 6) % 7 : firstDow;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

  const cells = [];

  for (let i = 0; i < startOffset; i += 1) {
    const day = daysInPrev - startOffset + 1 + i;
    cells.push(`<button class="day muted" type="button" tabindex="-1" disabled>${day}</button>`);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = toDateKey(viewYear, viewMonth, day);
    const isToday = day === t.day && viewMonth === t.month - 1 && viewYear === t.year;
    const hasSchedule = scheduleDates.has(dateKey);
    const selected = selectedDate === dateKey;
    const classes = ['day'];
    if (isToday) classes.push('today');
    if (hasSchedule) classes.push('has-schedule');
    if (selected) classes.push('selected');
    cells.push(
      `<button class="${classes.join(' ')}" type="button" data-date="${dateKey}" aria-label="${dateKey}">${day}</button>`
    );
  }

  while (cells.length % 7 !== 0) {
    const day = cells.length - (startOffset + daysInMonth) + 1;
    cells.push(`<button class="day muted" type="button" tabindex="-1" disabled>${day}</button>`);
  }

  // Always fill 6 weeks so the grid scales evenly with the window.
  while (cells.length < 42) {
    const day = cells.length - (startOffset + daysInMonth) + 1;
    cells.push(`<button class="day muted" type="button" tabindex="-1" disabled>${day}</button>`);
  }

  els.dayGrid.innerHTML = cells.join('');
}

async function shiftMonth(delta) {
  viewMonth += delta;
  if (viewMonth < 0) {
    viewMonth = 11;
    viewYear -= 1;
  } else if (viewMonth > 11) {
    viewMonth = 0;
    viewYear += 1;
  }
  await renderCalendar();
}

async function goToday() {
  const t = nowInZone();
  viewYear = t.year;
  viewMonth = t.month - 1;
  await renderCalendar();
}

function zoneOffsetMinutes(timeZone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(date);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
    const match = name.match(/GMT([+-])(\d+)(?::(\d+))?/i);
    if (!match) return 0;
    const sign = match[1] === '-' ? -1 : 1;
    const hours = Number(match[2]) || 0;
    const mins = Number(match[3]) || 0;
    return sign * (hours * 60 + mins);
  } catch (_) {
    return 0;
  }
}

function formatOffsetLabel(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

function formatZoneClock(timeZone, date = new Date()) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch (_) {
    return '--:--';
  }
}

function fillTimeZones(filter = '') {
  const q = filter.trim().toLowerCase();
  const now = new Date();
  const ordered = allTimeZones
    .filter((z) => !q || z.toLowerCase().includes(q))
    .map((z) => ({
      id: z,
      offset: zoneOffsetMinutes(z, now),
      clock: formatZoneClock(z, now),
    }))
    // Arrange by current UTC offset / local time (west → east), then name.
    .sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id));

  const preferred = settings.timeZone;

  els.timezone.innerHTML = ordered
    .map((z) => {
      const label = `${z.clock}  ${formatOffsetLabel(z.offset)}  ${z.id.replace(/_/g, ' ')}`;
      return `<option value="${z.id}"${z.id === preferred ? ' selected' : ''}>${label}</option>`;
    })
    .join('');
}

function formatHotkeyLabel(accelerator) {
  const accel = String(accelerator || '').trim();
  if (!accel) return 'Not set — click to record';
  return accel
    .replace(/CommandOrControl/gi, 'Ctrl')
    .replace(/Command/gi, 'Cmd')
    .replace(/Control/gi, 'Ctrl')
    .replace(/Option/gi, 'Alt')
    .replace(/\+/g, ' + ');
}

function syncHotkeyForm() {
  if (!els.hotkeyCapture) return;
  const accel = settings.toggleHotkey || '';
  els.hotkeyCapture.textContent = formatHotkeyLabel(accel);
  els.hotkeyCapture.classList.toggle('is-empty', !accel);
  els.hotkeyCapture.classList.remove('is-recording');
  if (els.hotkeyError) {
    els.hotkeyError.hidden = true;
    els.hotkeyError.textContent = '';
  }
}

function codeToAcceleratorKey(e) {
  const { code, key } = e;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  const map = {
    Space: 'Space',
    Tab: 'Tab',
    Enter: 'Enter',
    Escape: 'Esc',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',
    NumpadAdd: 'numadd',
    NumpadSubtract: 'numsub',
    NumpadMultiply: 'nummult',
    NumpadDivide: 'numdiv',
    NumpadDecimal: 'numdec',
  };
  if (map[code]) return map[code];
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`;
  // Fallback for uncommon keys
  if (key && key.length === 1) return key.toUpperCase();
  return null;
}

function eventToAccelerator(e) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const key = codeToAcceleratorKey(e);
  if (!key) return null;
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (!parts.length) return null;
  parts.push(key);
  return parts.join('+');
}

let hotkeyRecording = false;

function stopHotkeyRecording() {
  if (!hotkeyRecording) return;
  hotkeyRecording = false;
  window.removeEventListener('keydown', onHotkeyCaptureKeydown, true);
  syncHotkeyForm();
  if (els.hotkeyHint) {
    els.hotkeyHint.textContent =
      'Click the box, then press a shortcut. Opens or hides the gadget anywhere.';
  }
}

function startHotkeyRecording() {
  if (!els.hotkeyCapture) return;
  hotkeyRecording = true;
  els.hotkeyCapture.classList.add('is-recording');
  els.hotkeyCapture.classList.remove('is-empty');
  els.hotkeyCapture.textContent = 'Press keys…';
  if (els.hotkeyHint) {
    els.hotkeyHint.textContent = 'Waiting for shortcut (Esc to cancel)…';
  }
  if (els.hotkeyError) {
    els.hotkeyError.hidden = true;
    els.hotkeyError.textContent = '';
  }
  window.addEventListener('keydown', onHotkeyCaptureKeydown, true);
}

async function onHotkeyCaptureKeydown(e) {
  if (!hotkeyRecording) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') {
    stopHotkeyRecording();
    return;
  }
  const accel = eventToAccelerator(e);
  if (!accel) return;
  stopHotkeyRecording();
  els.hotkeyCapture.textContent = formatHotkeyLabel(accel);
  const next = await window.calendarApi.setSettings({ toggleHotkey: accel });
  if (next?.ok === false) {
    if (els.hotkeyError) {
      els.hotkeyError.hidden = false;
      els.hotkeyError.textContent = next.hotkeyError || 'Could not set hotkey';
    }
    syncHotkeyForm();
    return;
  }
  settings = next;
  syncHotkeyForm();
  showToast(`Hotkey: ${formatHotkeyLabel(settings.toggleHotkey)}`);
}

function syncSettingsForm() {
  const pct = Math.round(settings.opacity * 100);
  els.opacityRange.value = String(pct);
  els.opacityValue.textContent = `${pct}%`;
  els.weekStart.value = String(settings.weekStartsOn);
  if (els.compactMethodOrigin && els.compactMethodHover) {
    const hover = settings.compactMethod === 'hover';
    els.compactMethodOrigin.checked = !hover;
    els.compactMethodHover.checked = hover;
  }
  els.sizeWidth.min = String(limits.minWidth);
  els.sizeWidth.max = String(limits.maxWidth);
  els.sizeHeight.min = String(limits.minHeight);
  els.sizeHeight.max = String(limits.maxHeight);
  els.sizeWidth.value = String(settings.width);
  els.sizeHeight.value = String(settings.height);
  els.sizeHint.textContent = `Allowed size: ${limits.minWidth}–${limits.maxWidth} × ${limits.minHeight}–${limits.maxHeight}. Drag edges to resize.`;
  fillTimeZones(els.timezoneFilter.value);
  syncHotkeyForm();
}

async function persist(partial) {
  const next = await window.calendarApi.setSettings(partial);
  if (next?.ok === false) return settings;
  settings = next;
  return settings;
}

function setToolbarPinned(pinned) {
  els.shell.classList.toggle('toolbar-pinned', pinned);
}

function showTitlebar() {
  if (els.shell.classList.contains('is-compact')) return;
  els.shell.classList.add('titlebar-open');
}

function hideTitlebar() {
  els.shell.classList.remove('titlebar-open');
  blurTitlebarFocus();
}

let toastTimer = null;

async function syncClickThroughMode() {
  const pinned = !!settings.alwaysOnTop;
  const compact = isCompactMode();
  const alarmUp = !!(els.alarmPanel && !els.alarmPanel.hidden);
  // Click-through only when pinned AND compact AND no alarm UI.
  await window.calendarApi.setClickThrough(pinned && compact && !alarmUp);
}

function showToast(message) {
  if (!els.appToast) return;
  els.appToast.textContent = message;
  els.appToast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.appToast.hidden = true;
    toastTimer = null;
  }, 1800);
}

function applyCompactUi(compact) {
  const on = !!compact;
  const hover = isHoverCompactMethod();
  els.shell.classList.toggle('is-compact', on);
  els.shell.classList.toggle('is-compact-origin', on && !hover);
  els.shell.classList.toggle('is-compact-hover', on && hover);
  settings.compactMode = on;
  hideTitlebar();
  // Only force-unpin when entering compact. Expanding for alarm/milestones
  // must not clear toolbar-pinned before those overlays open.
  if (on) setToolbarPinned(false);
  if (els.btnMinimize) {
    els.btnMinimize.title = on ? 'Expand' : 'Minimize';
    els.btnMinimize.setAttribute('aria-label', on ? 'Expand' : 'Minimize');
  }
  updateClock();
  updateCompactTargetUi();
  void syncClickThroughMode();
}

function blurTitlebarFocus() {
  const active = document.activeElement;
  if (!active || active === document.body) return;
  if (active.closest?.('.titlebar')) active.blur();
}

function bindWindowDrag(el) {
  if (!el) return;
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, select, textarea, a')) return;
    // detail > 1 is the 2nd click of a double-click — do not start a drag.
    // Never preventDefault on mousedown here: that suppresses dblclick (compact mode).
    if (e.detail > 1) return;
    const startX = e.screenX;
    const startY = e.screenY;
    let origin = null;
    let dragging = false;
    let ready = window.calendarApi.getPosition().then((pos) => {
      origin = pos;
    });

    const onMove = (ev) => {
      const dx = ev.screenX - startX;
      const dy = ev.screenY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < 3) return;
        dragging = true;
      }
      void ready.then(() => {
        if (!origin) return;
        void window.calendarApi.setPosition(origin.x + dx, origin.y + dy);
      });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

async function expandFromCompact() {
  if (!settings.compactMode && !els.shell.classList.contains('is-compact')) return;
  settings = await window.calendarApi.setCompact(false);
  applyCompactUi(false);
}

async function enterCompactMode() {
  if (settings.compactMode || els.shell.classList.contains('is-compact')) return;
  // Keep alarm / milestone overlays on the full calendar so they stay usable.
  if (!els.alarmPanel.hidden) return;
  if (els.hourMilestoneOverlay && !els.hourMilestoneOverlay.hidden) return;
  if (els.thirtyMilestoneOverlay && !els.thirtyMilestoneOverlay.hidden) return;
  closeSettings();
  closeTargetOverlays();
  closeHelp();
  if (!els.schedulePanel.hidden) await closeSchedule();
  await refreshTargetState();
  const next = await window.calendarApi.setCompact(true);
  settings = { ...settings, ...next };
  applyCompactUi(true);
}

async function toggleCompactMode() {
  const goingCompact = !settings.compactMode && !els.shell.classList.contains('is-compact');
  if (goingCompact) {
    resumeCompactAfterAlert = false;
    await enterCompactMode();
    return;
  }
  // User chose to stay expanded — don't auto-collapse after alerts.
  resumeCompactAfterAlert = false;
  await expandFromCompact();
}

function hideTimeZoneList() {
  if (els.timezone) els.timezone.hidden = true;
  els.timezoneField?.classList.remove('is-open');
}

async function showTimeZoneList() {
  await ensureTimeZones();
  fillTimeZones(els.timezoneFilter.value);
  if (els.timezone) {
    els.timezone.hidden = false;
    els.timezoneField?.classList.add('is-open');
    requestAnimationFrame(() => {
      els.timezone.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
}

async function ensureTimeZones() {
  if (allTimeZones.length) return;
  allTimeZones = await window.calendarApi.getTimeZones();
}

async function openSettings() {
  await expandFromCompact();
  await ensureTimeZones();
  syncSettingsForm();
  hideTimeZoneList();
  els.schedulePanel.hidden = true;
  els.targetPanel.hidden = true;
  els.remainingPanel.hidden = true;
  stopRemainingLive();
  closeHelp();
  els.settingsPanel.hidden = false;
  setToolbarPinned(true);
}

function closeSettings() {
  stopHotkeyRecording();
  hideTimeZoneList();
  els.settingsPanel.hidden = true;
  if (
    els.schedulePanel.hidden &&
    els.targetPanel.hidden &&
    els.remainingPanel.hidden &&
    els.alarmPanel.hidden &&
    (!els.helpPanel || els.helpPanel.hidden)
  ) {
    setToolbarPinned(false);
  }
}

async function openHelp() {
  await expandFromCompact();
  closeSettings();
  els.schedulePanel.hidden = true;
  els.targetPanel.hidden = true;
  els.remainingPanel.hidden = true;
  stopRemainingLive();
  const hotkeyEl = document.getElementById('help-hotkey');
  if (hotkeyEl) {
    hotkeyEl.textContent = formatHotkeyLabel(settings.toggleHotkey) || 'not set';
  }
  if (els.helpPanel) els.helpPanel.hidden = false;
  setToolbarPinned(true);
}

function closeHelp() {
  if (els.helpPanel) els.helpPanel.hidden = true;
  if (
    els.schedulePanel.hidden &&
    els.targetPanel.hidden &&
    els.remainingPanel.hidden &&
    els.alarmPanel.hidden &&
    els.settingsPanel.hidden
  ) {
    setToolbarPinned(false);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function renderScheduleList() {
  if (!selectedDate) return;
  const items = await window.calendarApi.listSchedulesByDate(selectedDate);
  if (!items.length) {
    els.scheduleList.innerHTML = '<li class="schedule-empty">No meetings yet. Add one below.</li>';
    return;
  }

  els.scheduleList.innerHTML = items
    .map((item) => {
      const description = item.notes
        ? `<div class="meta">${escapeHtml(item.notes)}</div>`
        : '';
      return `<li class="schedule-item" data-id="${escapeHtml(item.id)}">
        <div class="schedule-top">
          <strong>${escapeHtml(item.title)}</strong>
          <button class="ghost-btn" type="button" data-delete="${escapeHtml(item.id)}" title="Delete" aria-label="Delete meeting">×</button>
        </div>
        ${description}
      </li>`;
    })
    .join('');
}

async function openSchedule(dateKey) {
  await expandFromCompact();
  selectedDate = dateKey;
  els.scheduleDateLabel.textContent = formatDateLabel(dateKey);
  els.scheduleError.hidden = true;
  els.scheduleError.textContent = '';
  els.scheduleForm.reset();
  els.settingsPanel.hidden = true;
  els.targetPanel.hidden = true;
  els.remainingPanel.hidden = true;
  stopRemainingLive();
  closeHelp();
  els.schedulePanel.hidden = false;
  setToolbarPinned(true);
  await renderScheduleList();
  await renderCalendar();
  els.scheduleTitle.focus();
}

async function closeSchedule() {
  els.schedulePanel.hidden = true;
  selectedDate = null;
  if (
    els.settingsPanel.hidden &&
    els.targetPanel.hidden &&
    els.remainingPanel.hidden &&
    els.alarmPanel.hidden &&
    (!els.helpPanel || els.helpPanel.hidden)
  ) {
    setToolbarPinned(false);
  }
  await renderCalendar();
}

function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  updateClock();
  const delay = 1000 - (Date.now() % 1000);
  setTimeout(() => {
    updateClock();
    renderCalendar();
    clockTimer = setInterval(() => {
      updateClock();
      const t = nowInZone();
      if (t.hour === 0 && t.minute === 0 && t.second < 2) {
        renderCalendar();
      }
    }, 1000);
  }, delay);
}

function bindEvents() {
  els.prevMonth.addEventListener('click', () => shiftMonth(-1));
  els.nextMonth.addEventListener('click', () => shiftMonth(1));
  els.btnToday.addEventListener('click', goToday);
  els.btnTarget.addEventListener('click', onTargetButtonClick);

  els.btnTargetClose.addEventListener('click', closeTargetOverlays);
  els.btnRemainingClose.addEventListener('click', closeTargetOverlays);
  els.remainingPanel.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    closeTargetOverlays();
  });
  document.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented) return;
    if (e.target.closest('input, textarea, select')) return;
    if (e.target.closest('.titlebar')) return;
    if (
      !els.remainingPanel.hidden ||
      !els.targetPanel.hidden ||
      !els.settingsPanel.hidden ||
      !els.schedulePanel.hidden ||
      !els.alarmPanel.hidden ||
      (els.helpPanel && !els.helpPanel.hidden)
    ) {
      return;
    }
    if (els.hourMilestoneOverlay && !els.hourMilestoneOverlay.hidden) return;
    if (els.thirtyMilestoneOverlay && !els.thirtyMilestoneOverlay.hidden) return;
    if (els.shell.classList.contains('is-compact')) return;
    e.preventDefault();
    showTitlebar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (
      els.shell.classList.contains('titlebar-open') &&
      !els.shell.classList.contains('toolbar-pinned')
    ) {
      hideTitlebar();
    }
    if (els.thirtyMilestoneOverlay && !els.thirtyMilestoneOverlay.hidden) {
      dismissThirtyMilestone();
      return;
    }
    if (els.hourMilestoneOverlay && !els.hourMilestoneOverlay.hidden) {
      dismissHourMilestone();
      return;
    }
    if (!els.remainingPanel.hidden || !els.targetPanel.hidden) {
      closeTargetOverlays();
      return;
    }
    if (els.helpPanel && !els.helpPanel.hidden) {
      closeHelp();
    }
  });
  els.content?.addEventListener('click', (e) => {
    if (!els.shell.classList.contains('titlebar-open')) return;
    if (els.shell.classList.contains('toolbar-pinned')) return;
    if (e.target.closest('.titlebar')) return;
    hideTitlebar();
  });
  if (els.hourMilestoneOverlay) {
    els.hourMilestoneOverlay.addEventListener('click', () => dismissHourMilestone());
    els.hourMilestoneOverlay.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      dismissHourMilestone();
    });
  }
  if (els.thirtyMilestoneOverlay) {
    els.thirtyMilestoneOverlay.addEventListener('click', () => dismissThirtyMilestone());
    els.thirtyMilestoneOverlay.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      dismissThirtyMilestone();
    });
  }
  window.addEventListener('resize', () => {
    if (els.thirtyMilestoneOverlay && !els.thirtyMilestoneOverlay.hidden) {
      resizeFireworksCanvas();
    }
  });
  els.btnClearTarget.addEventListener('click', async () => {
    await window.calendarApi.clearTarget();
    await refreshTargetState();
    closeTargetOverlays();
  });
  els.targetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const picker = ensureAlarmWheelPicker();
    const value = picker ? picker.getValue() : els.targetDatetime.value;
    if (!value) return;
    const ms = zonedDatetimeLocalToUtcMs(value, settings.timeZone);
    if (!Number.isFinite(ms)) {
      els.targetError.hidden = false;
      els.targetError.textContent = 'Invalid date/time';
      return;
    }
    const result = await window.calendarApi.setTarget(new Date(ms).toISOString());
    if (!result.ok) {
      els.targetError.hidden = false;
      els.targetError.textContent = result.error || 'Could not save target';
      return;
    }
    els.targetError.hidden = true;
    targetState = result;
    syncTargetButton();
    els.targetPanel.hidden = true;
    openRemainingPanel();
  });
  els.btnAlarmDismiss.addEventListener('click', async () => {
    await window.calendarApi.dismissAlarm();
    await hideAlarmPanel();
  });

  window.calendarApi.onAlarmTriggered((payload) => {
    targetState = {
      ...targetState,
      hasTarget: true,
      reached: true,
      alarmActive: true,
      targetTime: payload?.targetTime || targetState.targetTime,
    };
    showAlarmPanel(payload);
  });
  window.calendarApi.onAlarmStopped(() => {
    stopAlarmSound();
  });
  window.calendarApi.onHourMilestone((payload) => {
    showHourMilestone(payload?.hours, payload?.resumeCompact);
  });
  window.calendarApi.onHourMilestoneClear(() => {
    hideHourMilestone();
  });
  window.calendarApi.onThirtyMinuteMilestone((payload) => {
    showThirtyMilestone(payload?.resumeCompact);
  });
  window.calendarApi.onThirtyMinuteMilestoneClear(() => {
    hideThirtyMilestone();
  });

  // Mouse wheel changes months like Windows Calendar (up = previous, down = next).
  let wheelLock = false;
  els.calendarBlock.addEventListener(
    'wheel',
    (e) => {
      if (
        !els.schedulePanel.hidden ||
        !els.settingsPanel.hidden ||
        !els.targetPanel.hidden ||
        !els.remainingPanel.hidden ||
        !els.alarmPanel.hidden
      ) {
        return;
      }
      if (Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      if (wheelLock) return;
      wheelLock = true;
      shiftMonth(e.deltaY > 0 ? 1 : -1);
      setTimeout(() => {
        wheelLock = false;
      }, 140);
    },
    { passive: false }
  );

  els.dayGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('button.day[data-date]');
    if (!btn) return;
    openSchedule(btn.dataset.date);
  });

  els.btnSettings.addEventListener('click', openSettings);
  els.btnSettingsClose.addEventListener('click', closeSettings);
  els.btnHelpClose?.addEventListener('click', closeHelp);
  window.calendarApi.onHelpOpen(() => {
    void openHelp();
  });
  els.btnScheduleClose.addEventListener('click', closeSchedule);
  els.btnMinimize.addEventListener('click', () => {
    void toggleCompactMode();
  });
  // Double-click full calendar → compact. Double-click compact → full calendar.
  els.content?.addEventListener('dblclick', (e) => {
    if (e.target.closest('input, select, textarea, a')) return;
    if (
      e.target.closest(
        '.today-btn, .target-btn, .nav-btn, .icon-btn, .apply-btn, .primary-btn, .ghost-btn'
      )
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (settings.compactMode || els.shell.classList.contains('is-compact')) {
      resumeCompactAfterAlert = false;
      void expandFromCompact();
      return;
    }
    void enterCompactMode();
  });
  // While pinned+compact, temporarily accept mouse input when the pointer is over
  // the gadget so double-click can expand (clicks still pass through otherwise).
  document.addEventListener('mousemove', () => {
    if (!isCompactMode() || !settings.alwaysOnTop) return;
    void window.calendarApi.setClickThrough(false);
  });
  bindWindowDrag(els.content);
  els.shell.addEventListener('mouseleave', () => {
    if (!els.shell.classList.contains('toolbar-pinned')) blurTitlebarFocus();
    void syncClickThroughMode();
  });
  window.addEventListener('blur', () => {
    if (!els.shell.classList.contains('toolbar-pinned')) blurTitlebarFocus();
  });
  els.btnClose.addEventListener('click', () => window.calendarApi.close());
  window.calendarApi.onCompactChanged((payload) => {
    settings.compactMode = !!payload?.compact;
    applyCompactUi(settings.compactMode);
  });
  window.calendarApi.onPinChanged((payload) => {
    settings.alwaysOnTop = !!payload?.alwaysOnTop;
    void syncClickThroughMode();
    showToast(
      settings.alwaysOnTop
        ? 'Pinned — double-click compact to expand'
        : 'Unpinned from top'
    );
  });
  window.calendarApi.onCompactMethodChanged((payload) => {
    settings.compactMethod = payload?.compactMethod === 'hover' ? 'hover' : 'origin';
    syncSettingsForm();
    applyCompactUi(isCompactMode());
  });
  window.calendarApi.onOpacityChanged((payload) => {
    if (payload?.opacity == null) return;
    settings.opacity = Number(payload.opacity);
    const pct = Math.round(settings.opacity * 100);
    if (els.opacityRange) els.opacityRange.value = String(pct);
    if (els.opacityValue) els.opacityValue.textContent = `${pct}%`;
    showToast(`Opacity ${pct}%`);
  });

  els.scheduleList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    const id = btn.getAttribute('data-delete');
    const result = await window.calendarApi.deleteSchedule(id);
    if (!result.ok) {
      els.scheduleError.hidden = false;
      els.scheduleError.textContent = result.error;
      return;
    }
    await renderScheduleList();
    await renderCalendar();
  });

  els.scheduleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedDate) return;
    const title = els.scheduleTitle.value.trim();
    const notes = els.scheduleNotes.value.trim();
    const result = await window.calendarApi.createSchedule({
      date: selectedDate,
      title,
      notes,
    });
    if (!result.ok) {
      els.scheduleError.hidden = false;
      els.scheduleError.textContent = result.error;
      return;
    }
    els.scheduleError.hidden = true;
    els.scheduleForm.reset();
    await renderScheduleList();
    await renderCalendar();
  });

  els.opacityRange.addEventListener('input', async (e) => {
    const pct = Number(e.target.value);
    els.opacityValue.textContent = `${pct}%`;
    await persist({ opacity: pct / 100 });
  });

  els.weekStart.addEventListener('change', async (e) => {
    await persist({ weekStartsOn: Number(e.target.value) });
    await renderCalendar();
  });
  const onCompactMethodChange = async (e) => {
    const value = e.target.value === 'hover' ? 'hover' : 'origin';
    await persist({ compactMethod: value });
    applyCompactUi(isCompactMode());
    showToast(value === 'hover' ? 'Compact: method2' : 'Compact: method1');
  };
  els.compactMethodOrigin?.addEventListener('change', onCompactMethodChange);
  els.compactMethodHover?.addEventListener('change', onCompactMethodChange);
  els.hotkeyCapture?.addEventListener('click', () => {
    if (hotkeyRecording) {
      stopHotkeyRecording();
      return;
    }
    startHotkeyRecording();
  });
  els.hotkeyClear?.addEventListener('click', async () => {
    stopHotkeyRecording();
    const next = await window.calendarApi.setSettings({ toggleHotkey: '' });
    if (next?.ok === false) {
      if (els.hotkeyError) {
        els.hotkeyError.hidden = false;
        els.hotkeyError.textContent = next.hotkeyError || 'Could not clear hotkey';
      }
      return;
    }
    settings = next;
    syncHotkeyForm();
    showToast('Hotkey cleared');
  });

  els.applySize.addEventListener('click', async () => {
    const width = Number(els.sizeWidth.value) || settings.width;
    const height = Number(els.sizeHeight.value) || settings.height;
    settings = await persist({ width, height });
    els.sizeWidth.value = String(settings.width);
    els.sizeHeight.value = String(settings.height);
    closeSettings();
  });

  els.timezoneFilter.addEventListener('focus', () => {
    void showTimeZoneList();
  });
  els.timezoneFilter.addEventListener('click', () => {
    void showTimeZoneList();
  });
  els.timezoneFilter.addEventListener('input', (e) => {
    void showTimeZoneList().then(() => fillTimeZones(e.target.value));
  });

  els.timezone.addEventListener('change', async (e) => {
    await persist({ timeZone: e.target.value });
    updateClock();
    await goToday();
    closeSettings();
  });
}

async function init() {
  const loaded = await window.calendarApi.getSettings();
  limits = loaded.limits || limits;
  settings = loaded;
  applyCompactUi(!!settings.compactMode);
  bindEvents();
  await syncClickThroughMode();
  await refreshTargetState();
  await goToday();
  startClock();
  if (targetState.hasTarget && (targetState.reached || targetState.alarmActive || targetState.targetAlarmHandled)) {
    showAlarmPanel({ targetTime: targetState.targetTime });
  }
}

init();
