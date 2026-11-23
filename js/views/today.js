import { h, compact } from '../core/dom.js';
import { formatDateJa, todayStr } from '../core/date.js';
import { allTypes, compareItems } from '../types/registry.js';
import { itemRow, section } from '../ui/item-row.js';
import { backupBanner } from '../ui/backup-banner.js';
import { ICONS } from '../ui/icons.js';

// 「今日」画面: 各種類の todaySections をまとめて表示する
export default {
  id: 'today',
  label: '今日',
  icon: ICONS.today,
  title: () => formatDateJa(todayStr()),

  render(el, ctx) {
    const today = todayStr();
    const items = ctx.store.items();
    const sections = allTypes()
      .flatMap((type) => (type.todaySections || []).map((s) => ({ ...s, type })))
      .sort((a, b) => a.order - b.order);

    const blocks = sections.map((s) => {
      const all = items.filter((it) => it.type === s.type.id && s.filter(it, today)).sort(s.sort || compareItems);
      if (!all.length && s.empty == null) return null;
      // limit: 件数を絞る。more: 「すべて見る」で別の画面へ
      const list = s.limit ? all.slice(0, s.limit) : all;
      // 「すべて見る」は、表示しきれない時（件数が limit より多い時）だけ
      const more = s.more && s.limit && all.length > s.limit
        ? h('button', { type: 'button', class: 'row more-row', onclick: () => ctx.navigate(s.more.view) },
            h('div', { class: 'row-main' }, `${s.more.label}（${all.length}件）`), h('span', { class: 'chev' }, '›'))
        : null;
      return section(s.title, list.length
        ? [...list.map((it) => itemRow(it, ctx, { context: 'today' })), more]
        : h('p', { class: 'empty' }, s.empty));
    });

    el.append(...compact(backupBanner(ctx), blocks));
  },
};
