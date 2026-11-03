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
      const list = items.filter((it) => it.type === s.type.id && s.filter(it, today)).sort(compareItems);
      if (!list.length && s.empty == null) return null;
      return section(s.title, list.length
        ? list.map((it) => itemRow(it, ctx, { context: 'today' }))
        : h('p', { class: 'empty' }, s.empty));
    });

    el.append(...compact(backupBanner(ctx), blocks));
  },
};
