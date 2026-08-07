const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const els = {
  shell: document.querySelector('.shell'),
  clockTime: document.getElementById('clock-time'),
  clockDate: document.getElementById('clock-date'),
  clockZone: document.getElementById('clock-zone'),
  monthLabel: document.getElementById('month-label'),
  weekdayRow: document.getElementById('weekday-row'),
  dayGrid: document.getElementById('day-grid'),
  calendarBlock: document.querySelector('.calendar-block'),
  prevMonth: document.getElementById('prev-month'),
  nextMonth: document.getElementById('next-month'),
  btnToday: document.getElementById('btn-today'),
  btnSettings: document.getElementById('btn-settings'),
  btnSettingsClose: document.getElementById('btn-settings-close'),
  btnMinimize: document.getElementById('btn-minimize'),
  btnClose: document.getElementById('btn-close'),
  settingsPanel: document.getElementById('settings-panel'),
  schedulePanel: document.getElementById('schedule-panel'),
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
  alwaysOnTop: document.getElementById('always-on-top'),
  sizeWidth: document.getElementById('size-width'),
  sizeHeight: document.getElementById('size-height'),
  sizeHint: document.getElementById('size-hint'),
  applySize: document.getElementById('apply-size'),
  timezoneFilter: document.getElementById('timezone-filter'),
  timezone: document.getElementById('timezone'),
};

let settings = {
  opacity: 0.92,
  weekStartsOn: 0,
  alwaysOnTop: true,
  timeZone: 'America/New_York',
  width: 260,
  height: 360,
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
  els.clockDate.textContent = new Intl.DateTimeFormat(undefined, {
    timeZone: settings.timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
  els.clockZone.textContent = settings.timeZone.replace(/_/g, ' ');
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

function fillTimeZones(filter = '') {
  const q = filter.trim().toLowerCase();
  const list = allTimeZones.filter((z) => !q || z.toLowerCase().includes(q));
  const preferred = settings.timeZone;
  const ordered = list.includes(preferred)
    ? [preferred, ...list.filter((z) => z !== preferred)]
    : list;

  els.timezone.innerHTML = ordered
    .map(
      (z) =>
        `<option value="${z}"${z === preferred ? ' selected' : ''}>${z.replace(/_/g, ' ')}</option>`
    )
    .join('');
}

function syncSettingsForm() {
  const pct = Math.round(settings.opacity * 100);
  els.opacityRange.value = String(pct);
  els.opacityValue.textContent = `${pct}%`;
  els.weekStart.value = String(settings.weekStartsOn);
  els.alwaysOnTop.checked = !!settings.alwaysOnTop;
  els.sizeWidth.min = String(limits.minWidth);
  els.sizeWidth.max = String(limits.maxWidth);
  els.sizeHeight.min = String(limits.minHeight);
  els.sizeHeight.max = String(limits.maxHeight);
  els.sizeWidth.value = String(settings.width);
  els.sizeHeight.value = String(settings.height);
  els.sizeHint.textContent = `Allowed size: ${limits.minWidth}–${limits.maxWidth} × ${limits.minHeight}–${limits.maxHeight}. Drag edges to resize.`;
  fillTimeZones(els.timezoneFilter.value);
}

async function persist(partial) {
  settings = await window.calendarApi.setSettings(partial);
  return settings;
}

function setToolbarPinned(pinned) {
  els.shell.classList.toggle('toolbar-pinned', pinned);
}

async function ensureTimeZones() {
  if (allTimeZones.length) return;
  allTimeZones = await window.calendarApi.getTimeZones();
}

async function openSettings() {
  await ensureTimeZones();
  syncSettingsForm();
  els.schedulePanel.hidden = true;
  els.settingsPanel.hidden = false;
  setToolbarPinned(true);
}

function closeSettings() {
  els.settingsPanel.hidden = true;
  if (els.schedulePanel.hidden) setToolbarPinned(false);
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
  selectedDate = dateKey;
  els.scheduleDateLabel.textContent = formatDateLabel(dateKey);
  els.scheduleError.hidden = true;
  els.scheduleError.textContent = '';
  els.scheduleForm.reset();
  els.settingsPanel.hidden = true;
  els.schedulePanel.hidden = false;
  setToolbarPinned(true);
  await renderScheduleList();
  await renderCalendar();
  els.scheduleTitle.focus();
}

async function closeSchedule() {
  els.schedulePanel.hidden = true;
  selectedDate = null;
  if (els.settingsPanel.hidden) setToolbarPinned(false);
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

  // Mouse wheel changes months like Windows Calendar (up = previous, down = next).
  let wheelLock = false;
  els.calendarBlock.addEventListener(
    'wheel',
    (e) => {
      if (!els.schedulePanel.hidden || !els.settingsPanel.hidden) return;
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
  els.btnScheduleClose.addEventListener('click', closeSchedule);
  els.btnMinimize.addEventListener('click', () => window.calendarApi.minimize());
  els.btnClose.addEventListener('click', () => window.calendarApi.close());

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

  els.alwaysOnTop.addEventListener('change', async (e) => {
    await persist({ alwaysOnTop: e.target.checked });
  });

  els.applySize.addEventListener('click', async () => {
    const width = Number(els.sizeWidth.value) || settings.width;
    const height = Number(els.sizeHeight.value) || settings.height;
    settings = await persist({ width, height });
    els.sizeWidth.value = String(settings.width);
    els.sizeHeight.value = String(settings.height);
  });

  els.timezoneFilter.addEventListener('input', (e) => {
    fillTimeZones(e.target.value);
  });

  els.timezone.addEventListener('change', async (e) => {
    await persist({ timeZone: e.target.value });
    updateClock();
    await goToday();
  });
}

async function init() {
  const loaded = await window.calendarApi.getSettings();
  limits = loaded.limits || limits;
  settings = loaded;
  bindEvents();
  await goToday();
  startClock();
}

init();
