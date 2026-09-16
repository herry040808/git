'use strict';

/* =========================================================================
   接驳车实时查询 —— 前端逻辑
   - 数据来源：data/schedule.json（fetch 读取，本地预览需通过 http 服务打开）
   - 时钟每秒刷新，倒计时每秒重算，时刻表数据每分钟重新读取一次
   - 支持「智能 / 工作日 / 周末」切换，以及自定义查询时间
   ========================================================================= */

const DATA_URL = 'data/schedule.json';
const TICK_MS = 1000;
const FORCE_SYNC_MS = 120000; // 标签页被挂起等情况的兜底刷新
const SOON_SEC = 60; // 剩余不足 1 分钟视为「即将发车」
const UPCOMING_COUNT = 3; // 每个方向展示的下一班车数量

const SVG_NS = 'http://www.w3.org/2000/svg';
const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const DAY_KIND_LABEL = { weekday: '工作日', weekend: '周末' };

const ICONS = {
  bus:
    '<rect x="3" y="4.5" width="18" height="13" rx="2.5"/>' +
    '<path d="M3 11.5h18"/>' +
    '<path d="M7 8h2.6M14.4 8H17"/>' +
    '<circle cx="7.5" cy="19.6" r="1.6"/>' +
    '<circle cx="16.5" cy="19.6" r="1.6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.4V12l3.2 2"/>',
  route:
    '<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"/>' +
    '<circle cx="12" cy="10" r="2.6"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3"/><path d="M20.5 4v5h-5"/>',
};

const state = {
  data: null,
  mode: 'auto', // 'auto' | 'weekday' | 'weekend'
  dayKey: 'weekday',
  queryTime: null, // 'HH:MM'，为空表示跟随当前时间
  showFull: false,
  lastMinuteKey: null,
  lastSyncAt: 0,
};

const els = {
  siteTitle: document.getElementById('site-title'),
  clock: document.getElementById('current-time'),
  date: document.getElementById('current-date'),
  clockIcon: document.getElementById('clock-icon'),
  sectionIcon: document.getElementById('section-icon'),
  refreshIcon: document.getElementById('refresh-icon'),
  dayKind: document.getElementById('day-kind'),
  upcoming: document.getElementById('upcoming'),
  fullBoard: document.getElementById('full-board'),
  dayNote: document.getElementById('day-note'),
  status: document.getElementById('status'),
  credit: document.getElementById('credit'),
  queryTime: document.getElementById('query-time'),
  useNow: document.getElementById('use-now'),
  toggleFull: document.getElementById('toggle-full'),
  modeButtons: Array.from(document.querySelectorAll('[data-mode]')),
};

/* ------------------------------ 小工具 ------------------------------ */

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** "7:05" / "07:05" -> 从零点起的秒数；非法返回 null */
function parseTimeToSeconds(value) {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(String(value == null ? '' : value).trim());
  if (!matched) return null;
  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 3600 + minutes * 60;
}

function normalizeTimeLabel(value) {
  const text = String(value).trim();
  return text.length === 4 && text[1] === ':' ? `0${text}` : text;
}

function secondsOfDay(date) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

function minuteKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${pad2(date.getHours())}:${pad2(
    date.getMinutes(),
  )}`;
}

/** 当前该用哪张时刻表：周六、周日按周末，其余按工作日 */
function resolveDayKey(date) {
  if (state.mode === 'weekday' || state.mode === 'weekend') return state.mode;
  const day = date.getDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

/** 计算用的「现在」：设置了查询时间就用今天 + 查询时间 */
function effectiveNow() {
  const real = new Date();
  const seconds = parseTimeToSeconds(state.queryTime);
  if (seconds === null) return real;
  return new Date(
    real.getFullYear(),
    real.getMonth(),
    real.getDate(),
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    0,
  );
}

/** 极简 DOM 构造器 */
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value);
    }
  }
  const list = children === null || children === undefined ? [] : [].concat(children);
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** 生成 SVG 图标 */
function icon(name, className, size) {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.7');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  if (className) node.setAttribute('class', className);
  if (size) {
    node.setAttribute('width', String(size));
    node.setAttribute('height', String(size));
  }
  node.innerHTML = ICONS[name] || '';
  return node;
}

/* ---------------------------- 数据读取 ---------------------------- */

async function loadSchedule() {
  const response = await fetch(DATA_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.json();
}

async function sync() {
  state.lastSyncAt = Date.now();
  try {
    state.data = await loadSchedule();
    hideStatus();
    render();
  } catch (error) {
    showError(error);
  }
}

function hideStatus() {
  els.status.hidden = true;
  els.status.className = 'status';
  els.status.replaceChildren();
}

function showError(error) {
  const detail = error && error.message ? error.message : String(error);
  els.status.hidden = false;
  els.status.className = 'status is-error';
  els.status.replaceChildren(
    el('p', { text: '无法加载时刻表数据 data/schedule.json。' }),
    el('p', { text: `原因：${detail}` }),
    el('p', {
      text:
        '如果你是用 file:// 方式双击打开 index.html，浏览器会拦截本地 JSON 读取。' +
        '请在项目目录启动一个静态服务器后通过 http://localhost:8000/ 访问，具体命令见 README.md 的「本地预览」一节。',
    }),
  );
  if (!state.data) {
    els.upcoming.replaceChildren();
    els.fullBoard.replaceChildren();
  }
}

/* ------------------------------ 渲染 ------------------------------ */

function normalizeTrips(rawTrips) {
  if (!Array.isArray(rawTrips)) return [];
  return rawTrips
    .map((trip) => {
      const seconds = parseTimeToSeconds(trip && trip.time);
      if (seconds === null) return null;
      return {
        seconds,
        label: normalizeTimeLabel(trip.time),
        route: trip.route || '',
        line: trip.line || '',
        tone: trip.tone || '',
        note: trip.note || '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.seconds - b.seconds);
}

function render() {
  const data = state.data;
  if (!data) return;

  const meta = data.meta || {};
  els.siteTitle.textContent = meta.title || '接驳车时刻表';
  els.credit.textContent = `${meta.note ? `${meta.note} · ` : ''}数据更新于 ${meta.updated || '—'}`;

  const now = effectiveNow();
  state.dayKey = resolveDayKey(now);
  els.dayKind.textContent = DAY_KIND_LABEL[state.dayKey] || '工作日';

  const day = (data.schedules || {})[state.dayKey] || null;
  const dayNote = (day && day.note) || '';
  els.dayNote.textContent = dayNote;
  els.dayNote.hidden = dayNote === '';

  if (!day) {
    els.upcoming.replaceChildren(
      el('p', { class: 'empty-item', text: `时刻表中缺少 ${state.dayKey} 的数据。` }),
    );
    return;
  }

  const directions = Array.isArray(data.directions) ? data.directions : [];
  const groups = directions.map((direction) => ({
    direction,
    trips: normalizeTrips(day[direction.key]),
  }));

  els.upcoming.replaceChildren(...groups.map(buildUpcomingPanel));
  els.fullBoard.replaceChildren(...groups.map(buildFullPanel));
  els.fullBoard.hidden = !state.showFull;
  els.toggleFull.textContent = state.showFull ? '收起完整时刻表' : '显示完整时刻表';

  updateCountdowns(now);
}

/** 「即将发车」卡片：每个方向列出下一班车 */
function buildUpcomingPanel(group) {
  const nowSec = secondsOfDay(effectiveNow());
  const upcoming = group.trips.filter((trip) => trip.seconds > nowSec).slice(0, UPCOMING_COUNT);

  const list = el('ul', { class: 'trip-list' });
  if (upcoming.length === 0) {
    list.append(
      el('li', {
        class: 'empty-item',
        text: group.trips.length === 0 ? '今日暂无班次安排。' : '今日班次已结束，明天请早。',
      }),
    );
  } else {
    for (const trip of upcoming) list.append(buildTripRow(trip, { withBadge: true }));
  }

  return el('section', { class: 'panel', dataset: { direction: group.direction.key || '' } }, [
    el('div', { class: 'panel-head' }, [
      el('span', { class: 'panel-icon' }, [icon('bus')]),
      el('h3', { text: group.direction.label || group.direction.key || '未命名方向' }),
      el('span', {
        class: 'panel-meta',
        text: group.trips.length ? `共 ${group.trips.length} 班` : '',
      }),
    ]),
    list,
  ]);
}

/** 完整时刻表卡片 */
function buildFullPanel(group) {
  const list = el('ul', { class: 'trip-list' });
  if (group.trips.length === 0) {
    list.append(el('li', { class: 'empty-item', text: '今日暂无班次安排。' }));
  } else {
    for (const trip of group.trips) list.append(buildTripRow(trip, { withBadge: true }));
  }

  return el('section', { class: 'panel', dataset: { direction: group.direction.key || '' } }, [
    el('div', { class: 'panel-head' }, [
      el('span', { class: 'panel-icon' }, [icon('bus')]),
      el('h3', { text: group.direction.label || group.direction.key || '未命名方向' }),
    ]),
    list,
  ]);
}

function buildTripRow(trip, options) {
  const withBadge = Boolean(options && options.withBadge);
  const badgeClass = trip.tone ? `line-badge tone-${trip.tone}` : 'line-badge';

  const routeChildren = [icon('route')];
  if (withBadge && trip.line) routeChildren.push(el('span', { class: badgeClass, text: trip.line }));
  routeChildren.push(el('p', { text: trip.route }));

  const countdownValue = el('p', { class: 'countdown-value', text: '—' });
  const countdownUnit = el('p', { class: 'countdown-unit', text: '' });

  const row = el('li', { class: 'trip', dataset: { departSeconds: String(trip.seconds) } }, [
    el('div', { class: 'trip-main' }, [
      el('p', { class: 'trip-time', text: trip.label }),
      el('div', { class: 'trip-route' }, routeChildren),
      trip.note ? el('p', { class: 'trip-note', text: trip.note }) : null,
    ]),
    el('div', { class: 'countdown' }, [countdownValue, countdownUnit]),
  ]);

  row.countdownNodes = { value: countdownValue, unit: countdownUnit, seconds: trip.seconds };
  return row;
}

/* ---------------------------- 时钟与倒计时 ---------------------------- */

function updateClock(now) {
  els.clock.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  els.date.textContent =
    `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日${WEEKDAY_NAMES[now.getDay()]}`;
}

function updateCountdowns(now) {
  const nowSec = secondsOfDay(now);

  for (const row of els.upcoming.querySelectorAll('.trip')) {
    const info = row.countdownNodes;
    if (!info) continue;
    const diff = info.seconds - nowSec;

    row.classList.remove('is-past', 'is-soon', 'is-next');

    if (diff <= 0) {
      info.value.textContent = '已发车';
      info.unit.textContent = '';
      row.classList.add('is-past');
    } else if (diff <= SOON_SEC) {
      info.value.textContent = '即将发车';
      info.unit.textContent = '';
      row.classList.add('is-soon');
    } else {
      info.value.textContent = `${Math.ceil(diff / 60)} 分钟`;
      info.unit.textContent = '后';
      row.classList.add('is-next');
    }
  }

  for (const row of els.fullBoard.querySelectorAll('.trip')) {
    const info = row.countdownNodes;
    if (!info) continue;
    row.classList.toggle('is-past', info.seconds <= nowSec);
  }
}

function tick() {
  const real = new Date();
  const now = effectiveNow();

  if (state.data && resolveDayKey(now) !== state.dayKey) render();

  updateClock(real);
  updateCountdowns(now);

  const key = minuteKey(real);
  if (key !== state.lastMinuteKey) {
    state.lastMinuteKey = key;
    sync();
  } else if (real.getTime() - state.lastSyncAt > FORCE_SYNC_MS) {
    sync();
  }
}

/* ------------------------------ 交互 ------------------------------ */

function bindControls() {
  for (const button of els.modeButtons) {
    button.addEventListener('click', () => {
      const mode = button.dataset.mode;
      if (state.mode === mode) return;
      state.mode = mode;
      for (const item of els.modeButtons) item.classList.toggle('is-active', item === button);
      if (state.data) render();
      else sync();
    });
  }

  els.queryTime.addEventListener('change', () => {
    state.queryTime = els.queryTime.value || null;
    if (state.data) render();
  });

  els.useNow.addEventListener('click', () => {
    state.queryTime = null;
    els.queryTime.value = '';
    if (state.data) render();
  });

  els.toggleFull.addEventListener('click', () => {
    state.showFull = !state.showFull;
    els.fullBoard.hidden = !state.showFull;
    els.toggleFull.textContent = state.showFull ? '收起完整时刻表' : '显示完整时刻表';
    updateCountdowns(effectiveNow());
  });
}

function init() {
  els.clockIcon.append(icon('clock'));
  els.sectionIcon.append(icon('bus'));
  els.refreshIcon.append(icon('refresh'));

  bindControls();

  const now = new Date();
  state.lastMinuteKey = minuteKey(now);
  state.dayKey = resolveDayKey(now);

  updateClock(now);
  sync();

  setInterval(tick, TICK_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    state.lastMinuteKey = minuteKey(new Date());
    sync();
  });
}

document.addEventListener('DOMContentLoaded', init);
