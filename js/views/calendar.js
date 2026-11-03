import { h } from '../core/dom.js';
import { formatDateJa, toDateStr, todayStr, WEEKDAYS } from '../core/date.js';
import { allTypes, compareItems } from '../types/registry.js';
import { itemRow, section } from '../ui/item-row.js';
import { ICONS } from '../ui/icons.js';

// 画面を切り替えても表示中の月・選択日を覚えておく
const state = { month: null, selected: null }; // month: "YYYY-MM"

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return toDateStr(d).slice(0, 7);
}

export default {
  id: 'calendar',
  label: 'カレンダー',
  icon: ICONS.calendar,
  title: 'カレンダー',
  fabContext: () => ({ date: state.selected }),

  render(el, ctx) {
    const today = todayStr();
    state.selected ??= today;
    state.month ??= today.slice(0, 7);

    const [y, m] = state.month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
    const start = new Date(y, m - 1, 1 - first.getDay());

    const types = allTypes().filter((t) => t.occursOn);
    const items = ctx.store.items((it) => types.some((t) => t.id === it.type));
    const itemsOn = (date) => items.filter((it) => types.find((t) => t.id === it.type).occursOn(it, date));

    const go = (patch) => { Object.assign(state, patch); ctx.rerender(); };

    const head = h('div', { class: 'cal-head' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': '前の月', onclick: () => go({ month: shiftMonth(state.month, -1) }) }, '‹'),
      h('div', { class: 'month' }, `${y}年${m}月`),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': '次の月', onclick: () => go({ month: shiftMonth(state.month, 1) }) }, '›'),
      h('button', { type: 'button', class: 'pill-btn', onclick: () => go({ month: today.slice(0, 7), selected: today }) }, '今日')
    );

    const cells = [];
    WEEKDAYS.forEach((w, i) => cells.push(h('div', { class: `wd${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}` }, w)));
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ds = toDateStr(d);
      const dayTypes = [...new Set(itemsOn(ds).map((it) => it.type))];
      const cls = ['day'];
      if (d.getMonth() !== m - 1) cls.push('other');
      if (d.getDay() === 0) cls.push('sun');
      if (d.getDay() === 6) cls.push('sat');
      if (ds === today) cls.push('today');
      if (ds === state.selected) cls.push('selected');
      cells.push(h('button', {
        type: 'button',
        class: cls.join(' '),
        'aria-label': formatDateJa(ds),
        onclick: () => go({ selected: ds, month: ds.slice(0, 7) }),
      },
        h('span', { class: 'num' }, d.getDate()),
        h('span', { class: 'dots' }, dayTypes.slice(0, 3).map((t) =>
          h('i', { style: `background:${types.find((x) => x.id === t).color}` })))
      ));
    }

    const dayItems = itemsOn(state.selected).sort(compareItems);
    el.append(
      head,
      h('div', { class: 'cal-grid' }, cells),
      section(formatDateJa(state.selected), dayItems.length
        ? dayItems.map((it) => itemRow(it, ctx))
        : h('p', { class: 'empty' }, '予定・タスクはありません'))
    );
  },
};
