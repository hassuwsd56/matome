import { h } from '../core/dom.js';
import { getType } from '../types/registry.js';
import { toast } from './toast.js';
import { itemColor } from '../core/colors.js';

// 一覧の1行。表示内容は各種類の rowInfo() が決める。
export function itemRow(item, ctx, opts = {}) {
  const type = getType(item.type);
  if (!type) return null;
  const info = type.rowInfo(item, opts);
  // 共有カレンダーの予定は、カレンダーの色と名前を出す
  const cal = item.calendarId ? ctx.store.calendar?.(item.calendarId) : null;
  // 共有しているカレンダーなら、入れた人の名前も出す
  const by = type.createdByName?.(item, ctx.store);
  if (cal) info.sub = [cal.name, by, info.sub].filter(Boolean).join('・');

  const lead = type.checkable
    ? h('button', {
        type: 'button',
        class: `check${item.done ? ' on' : ''}`,
        'aria-label': item.done ? '未完了に戻す' : '完了にする',
        onclick: (e) => {
          e.stopPropagation();
          ctx.store.update(item.id, type.toggleDone(item)).catch(() => toast('保存に失敗しました'));
        },
      })
    : h('span', { class: 'type-dot', style: `background:${itemColor(item, ctx.store, type)}` });

  const open = () => ctx.openEditor({ item });
  return h(
    'div',
    {
      class: `row${item.done ? ' done' : ''}${info.tone ? ` ${info.tone}` : ''}`,
      role: 'button',
      tabindex: '0',
      onclick: open,
      onkeydown: (e) => { if (e.key === 'Enter') open(); },
    },
    lead,
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, info.title),
      info.sub ? h('div', { class: 'row-sub' }, info.sub) : null
    )
  );
}

// 見出し付きのまとまり
export function section(title, children) {
  return h('section', { class: 'section' }, title ? h('h2', null, title) : null, h('div', { class: 'list' }, children));
}
