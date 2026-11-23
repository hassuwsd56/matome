import { h } from '../core/dom.js';
import { addDays, formatDateJa, parseDateStr, toDateStr, todayStr, WEEKDAYS } from '../core/date.js';
import { holidayName } from '../core/holidays.js';
import { allTypes, compareItems, getType } from '../types/registry.js';
import { openDaySheet } from '../ui/day-sheet.js';
import { ICONS } from '../ui/icons.js';
import { itemColor } from '../core/colors.js';
import { openCalendarSheet, openCreateSheet } from '../features/sharing.js';

// 画面を切り替えても表示中の月・選んだ日を覚えておく
const FILTER_KEY = 'matome:calFilter';
// filter: 'all'（すべてのカレンダー）か、表示するカレンダーの ID
const state = { month: null, selected: null, slideFrom: null, filter: localStorage.getItem(FILTER_KEY) || 'all' }; // month: "YYYY-MM"、slideFrom: 月を変えた時に新しい月が入ってくる向き

// 週の行の中の寸法（px）: 日付の数字の高さ・帯 1 本の高さ・「+2」の高さ
const NUM_H = 24;
const BAR_H = 17;
const MORE_H = 14;
// 月を切り替える時の横の動きの時間（ミリ秒）
const SLIDE_MS = 350;

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  return toDateStr(new Date(y, m - 1 + n, 1)).slice(0, 7);
}

const daysBetween = (a, b) => Math.round((parseDateStr(b) - parseDateStr(a)) / 86400000);

function init() {
  const today = todayStr();
  state.selected ??= today;
  state.month ??= today.slice(0, 7);
}

// 1 週間分の帯を、重ならないように段（lane）へ割り当てる
function layoutWeek(weekStart, items) {
  const weekEnd = addDays(weekStart, 6);
  const bars = [];
  for (const it of items) {
    const [s, e] = getType(it.type).span(it);
    if (!s || e < weekStart || s > weekEnd) continue;
    const from = s < weekStart ? weekStart : s;
    const to = e > weekEnd ? weekEnd : e;
    bars.push({ it, c0: daysBetween(weekStart, from), c1: daysBetween(weekStart, to), contL: s < weekStart, contR: e > weekEnd });
  }
  // 祝日名も帯として先頭に出す
  for (let i = 0; i < 7; i++) {
    const name = holidayName(addDays(weekStart, i));
    if (name) bars.push({ holiday: name, c0: i, c1: i });
  }
  // 早く始まる順 → 長い順 → 祝日 → いつもの並び順
  bars.sort((a, b) => a.c0 - b.c0 || (b.c1 - b.c0) - (a.c1 - a.c0)
    || (b.holiday ? 1 : 0) - (a.holiday ? 1 : 0)
    || (a.it && b.it ? compareItems(a.it, b.it) : 0));
  const lanes = [];
  for (const bar of bars) {
    let lane = lanes.findIndex((used) => used.every(([a, b]) => bar.c1 < a || bar.c0 > b));
    if (lane < 0) { lane = lanes.length; lanes.push([]); }
    lanes[lane].push([bar.c0, bar.c1]);
    bar.lane = lane;
  }
  return { bars, laneCount: lanes.length };
}

let lastCtx = null;
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (lastCtx && document.body.dataset.view === 'calendar') lastCtx.rerender(); }, 150);
});

export default {
  id: 'calendar',
  label: 'カレンダー',
  icon: ICONS.calendar,
  title: () => { init(); const [y, m] = state.month.split('-').map(Number); return `${y}年${m}月`; },
  fullScreen: true, // 上の見出しを隠し、画面いっぱいに表示する
  fabContext: () => {
    const c = { date: state.selected };
    if (state.filter !== 'all' && lastCtx?.store.canEdit({ calendarId: state.filter })) c.calendarId = state.filter;
    return c;
  },

  render(el, ctx) {
    lastCtx = ctx;
    init();
    const today = todayStr();
    const [y, m] = state.month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
    const gridStart = toDateStr(new Date(y, m - 1, 1 - first.getDay()));

    const store = ctx.store;
    const cals = store.calendars();
    if (state.filter !== 'all' && !cals.some((c) => c.id === state.filter)) state.filter = 'all';
    const myCal = store.defaultCalendarId();
    // 表示中のカレンダーに入っている物だけ出す（タスクはマイカレンダーと「すべて」に出す）
    const visible = (it) => {
      if (state.filter === 'all') return true;
      if (it.type !== 'event') return state.filter === myCal;
      return (it.calendarId || myCal) === state.filter;
    };
    const types = allTypes().filter((t) => t.occursOn && t.span);
    const items = store.items((it) => types.some((t) => t.id === it.type) && visible(it));

    const go = (patch) => { Object.assign(state, patch); ctx.rerender(); };
    const setFilter = (f) => { localStorage.setItem(FILTER_KEY, f); go({ filter: f }); };

    const head = h('div', { class: 'cal-head' },
      h('div', { class: 'month' }, `${y}年${m}月`),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': '前の月', onclick: () => go({ month: shiftMonth(state.month, -1), slideFrom: 'left' }) }, '‹'),
      h('button', { type: 'button', class: 'pill-btn', onclick: () => go({ month: today.slice(0, 7), selected: today }) }, '今日'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': '次の月', onclick: () => go({ month: shiftMonth(state.month, 1), slideFrom: 'right' }) }, '›')
    );
    const wdRow = h('div', { class: 'cal-wd' }, WEEKDAYS.map((w, i) =>
      h('div', { class: `wd${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}` }, w)));
    const weeksEl = h('div', { class: 'cal-weeks' });
    // カレンダーの切り替え（ログインしている時だけ）
    let chips = null;
    if (store.isCloud) {
      const chip = (id, label, color) => h('button', {
        type: 'button', class: `chip${state.filter === id ? ' on' : ''}`, dataset: { filter: id },
        style: color ? `--chip:${color}` : null, onclick: () => setFilter(id),
      }, color ? h('i', { class: 'chip-dot' }) : null, label);
      const cur = state.filter !== 'all' ? store.calendar(state.filter) : null;
      chips = h('div', { class: 'cal-bar' },
        h('div', { class: 'cal-chips' },
          chip('all', 'すべて'),
          cals.map((c) => chip(c.id, c.name, c.color)),
          h('button', { type: 'button', class: 'chip add', id: 'chip-create', onclick: () => openCreateSheet(ctx) }, '＋ 作成')),
        cur ? h('div', { class: 'cal-info' },
          h('span', null, `${cur.memberIds.length > 1 ? `${cur.memberIds.length}人で共有中` : '自分だけ'}・${{ owner: 'オーナー', editor: '編集できる', viewer: '見るだけ' }[store.roleIn(cur.id)] || ''}`),
          h('button', { type: 'button', class: 'link-btn', id: 'cal-manage', onclick: () => openCalendarSheet(ctx, cur.id) }, '共有・設定 ›')) : null);
    }
    const wrap = h('div', { class: 'cal' }, head, chips, wdRow, weeksEl); // 指の動きはこの中だけで扱う
    el.append(wrap);

    // 画面の残りの高さを週の数で割って、1 週の高さを決める
    const tabbarH = document.getElementById('tabbar')?.offsetHeight || 0;
    const avail = window.innerHeight - weeksEl.getBoundingClientRect().top - tabbarH - 4;
    const weekH = Math.max(72, Math.floor(avail / weeks));

    for (let w = 0; w < weeks; w++) {
      const weekStart = addDays(gridStart, w * 7);
      const { bars, laneCount } = layoutWeek(weekStart, items);
      const fitAll = Math.floor((weekH - NUM_H - 2) / BAR_H);
      const maxLanes = laneCount <= fitAll ? fitAll : Math.max(1, Math.floor((weekH - NUM_H - MORE_H - 2) / BAR_H));

      // 段に入りきらない帯の数（日ごと）
      const hidden = Array(7).fill(0);
      for (const b of bars) if (b.lane >= maxLanes) for (let c = b.c0; c <= b.c1; c++) hidden[c]++;

      const days = [];
      for (let i = 0; i < 7; i++) {
        const ds = addDays(weekStart, i);
        const d = parseDateStr(ds);
        const cls = ['day'];
        if (d.getMonth() !== m - 1) cls.push('other');
        if (d.getDay() === 0) cls.push('sun');
        if (d.getDay() === 6) cls.push('sat');
        const holiday = holidayName(ds);
        if (holiday) cls.push('holiday');
        if (ds === today) cls.push('today');
        if (ds === state.selected) cls.push('selected');
        days.push(h('button', {
          type: 'button',
          class: cls.join(' '),
          'aria-label': holiday ? `${formatDateJa(ds)} ${holiday}` : formatDateJa(ds),
          onclick: () => { state.selected = ds; el.querySelector('.day.selected')?.classList.remove('selected'); days[i].classList.add('selected'); openDaySheet(ds, ctx, { visible, calendarId: state.filter !== 'all' && store.canEdit({ calendarId: state.filter }) ? state.filter : null }); },
        },
          h('span', { class: 'num' }, d.getDate()),
          hidden[i] ? h('span', { class: 'more' }, `+${hidden[i]}`) : null
        ));
      }

      const barEls = bars.filter((b) => b.lane < maxLanes).map((b) => {
        const cls = ['bar'];
        if (b.holiday) cls.push('holiday-bar');
        else cls.push(`t-${b.it.type}`);
        if (b.it?.done) cls.push('done');
        if (b.contL) cls.push('cont-l');
        if (b.contR) cls.push('cont-r');
        const color = b.it ? itemColor(b.it, ctx.store, getType(b.it.type)) : null;
        return h('div', {
          class: cls.join(' '),
          style: `grid-column:${b.c0 + 1} / ${b.c1 + 2};grid-row:${b.lane + 1};${color ? `background:${color}` : ''}`,
        }, b.holiday || b.it.title);
      });

      weeksEl.append(h('div', { class: 'week', style: `height:${weekH}px` },
        h('div', { class: 'week-days' }, days),
        h('div', { class: 'week-bars', style: `top:${NUM_H}px;grid-auto-rows:${BAR_H - 1}px` }, barEls)
      ));
    }

    // 月を変えた直後: 新しい月を横からすべり込ませる
    if (state.slideFrom) {
      const from = state.slideFrom === 'right' ? 1 : -1;
      state.slideFrom = null;
      weeksEl.style.transform = `translateX(${from * 35}%)`;
      weeksEl.style.opacity = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        weeksEl.style.transition = `transform ${SLIDE_MS}ms ease-out, opacity ${SLIDE_MS}ms ease-out`;
        weeksEl.style.transform = '';
        weeksEl.style.opacity = '';
      }));
    }

    // 指に合わせて横に動かし、離した時に一定以上動いていれば月を切り替える。上下には動かさない。
    let sx = 0, sy = 0, dx = 0, lock = null;
    wrap.addEventListener('touchstart', (e) => {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; lock = null;
      if (e.target.closest('.cal-chips')) lock = 'chips'; // ボタンの列は横にスクロールさせる（月は変えない）
      weeksEl.style.transition = 'none';
    }, { passive: true });
    wrap.addEventListener('touchmove', (e) => {
      const x = e.touches[0].clientX - sx;
      const y = e.touches[0].clientY - sy;
      if (lock === 'chips') return;
      if (!lock && (Math.abs(x) > 8 || Math.abs(y) > 8)) lock = Math.abs(x) > Math.abs(y) ? 'h' : 'v';
      if (!lock) return;
      e.preventDefault(); // 画面が上下に動かないようにする
      if (lock === 'h') { dx = x; weeksEl.style.transform = `translateX(${x}px)`; }
    }, { passive: false });
    wrap.addEventListener('touchend', () => {
      if (lock !== 'h') return;
      const w = weeksEl.offsetWidth || window.innerWidth;
      if (Math.abs(dx) > Math.min(80, w * 0.2)) {
        const next = dx < 0;
        weeksEl.style.transition = `transform ${SLIDE_MS}ms ease-in, opacity ${SLIDE_MS}ms ease-in`;
        weeksEl.style.transform = `translateX(${next ? -w : w}px)`;
        weeksEl.style.opacity = '0';
        setTimeout(() => go({ month: shiftMonth(state.month, next ? 1 : -1), slideFrom: next ? 'right' : 'left' }), SLIDE_MS);
      } else {
        weeksEl.style.transition = 'transform 250ms ease-out';
        weeksEl.style.transform = '';
      }
    });
  },
};
