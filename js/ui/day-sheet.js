import { h, compact } from '../core/dom.js';
import { formatDateJa } from '../core/date.js';
import { holidayName } from '../core/holidays.js';
import { allTypes, compareItems } from '../types/registry.js';
import { itemRow } from './item-row.js';
import { lockScroll, unlockScroll, fitToVisibleArea } from './sheet.js';

// カレンダーで日付をタップした時に下から出る「その日の一覧」
// opts.visible: 表示中のカレンダーで絞り込む関数、opts.calendarId: 「＋ 追加」で入れるカレンダー
export function openDaySheet(date, ctx, opts = {}) {
  const root = document.getElementById('sheet-root');
  const sheet = h('div', { class: 'sheet day-sheet', role: 'dialog', 'aria-modal': 'true' });
  const openedAt = Date.now();
  const backdrop = h('div', { class: 'backdrop', onclick: () => { if (Date.now() - openedAt > 400) close(); } });
  root.replaceChildren(backdrop, sheet);
  document.body.classList.add('sheet-open');
  lockScroll();
  const fitting = fitToVisibleArea(sheet);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    unsubscribe();
    fitting();
    root.classList.remove('open');
    document.body.classList.remove('sheet-open');
    unlockScroll();
    setTimeout(() => { if (!root.classList.contains('open')) root.replaceChildren(); }, 300);
  }

  // 一覧の行をタップしたら、このシートを閉じてから入力シートを開く
  const sheetCtx = { ...ctx, openEditor: (opts) => { close(); ctx.openEditor(opts); } };
  const types = allTypes().filter((t) => t.occursOn);
  const holiday = holidayName(date);
  const body = h('div', { class: 'sheet-body' });

  function renderList() {
    const items = ctx.store
      .items((it) => types.some((t) => t.id === it.type && t.occursOn(it, date)) && (!opts.visible || opts.visible(it)))
      .sort(compareItems);
    body.replaceChildren(...compact(
      holiday ? h('p', { class: 'day-holiday' }, holiday) : null,
      h('div', { class: 'list' }, items.length
        ? items.map((it) => itemRow(it, sheetCtx))
        : h('p', { class: 'empty' }, '予定・タスクはありません'))
    ));
  }
  // 完了チェックなどでデータが変わったら一覧を作り直す
  const unsubscribe = ctx.store.subscribe(renderList);

  sheet.append(
    h('div', { class: 'sheet-header' },
      h('button', { type: 'button', class: 'link-btn', onclick: close }, '閉じる'),
      h('div', { class: 'sheet-title' }, formatDateJa(date)),
      h('button', { type: 'button', class: 'link-btn strong', onclick: () => sheetCtx.openEditor({ ctx: opts.calendarId ? { date, calendarId: opts.calendarId } : { date } }) }, '＋ 追加')
    ),
    body
  );
  renderList();
  return close;
}
