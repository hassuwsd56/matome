import { h } from '../core/dom.js';
import { itemRow } from '../ui/item-row.js';
import { ICONS } from '../ui/icons.js';

let query = '';

// メモ画面: 新しく更新した順に一覧＋検索
export default {
  id: 'memos',
  label: 'メモ',
  icon: ICONS.memo,
  title: 'メモ',
  fabType: 'memo',

  render(el, ctx) {
    const listEl = h('div', { class: 'list' });

    const renderList = () => {
      const q = query.trim().toLowerCase();
      const memos = ctx.store
        .items((it) => it.type === 'memo' && (!q || `${it.title || ''}\n${it.body || ''}`.toLowerCase().includes(q)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      listEl.replaceChildren(...(memos.length
        ? memos.map((it) => itemRow(it, ctx))
        : [h('p', { class: 'empty' }, q ? '見つかりませんでした' : 'メモはまだありません')]));
    };

    const search = h('input', {
      type: 'search', class: 'search', placeholder: 'メモを検索', value: query,
      oninput: (e) => { query = e.target.value; renderList(); },
    });

    renderList();
    el.append(search, listEl);
  },
};
