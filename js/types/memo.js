import { formatDateTime } from '../core/date.js';

// メモ（カレンダーには出さない。「今日」には新しい順に数件だけ出す）
export default {
  id: 'memo',
  label: 'メモ',
  color: 'var(--c-memo)',

  fields: [
    { key: 'title', label: 'タイトル', input: 'text', placeholder: '（省略可）' },
    // fill: 本文欄をシートの残りいっぱいに広げ、長くなったら欄の中でスクロールする
    // （欄がキーボードの裏まで伸びると、iPhone が入力位置を見せようとして画面を動かすため）
    { key: 'body', label: '本文', input: 'textarea', rows: 10, fill: true },
  ],

  validate: (v) => (!v.title && !(v.body || '').trim() ? 'タイトルか本文を入力してください' : null),

  // 「今日」画面: 最近更新したメモを 3 件と「すべて見る」
  todaySections: [
    {
      title: 'メモ',
      order: 40,
      filter: () => true,
      sort: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''),
      limit: 3,
      more: { label: 'メモをすべて見る', view: 'memos' },
      empty: null,
    },
  ],

  rowInfo(it) {
    const lines = (it.body || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const title = it.title || lines[0] || '（無題）';
    const preview = it.title ? lines[0] : lines[1];
    return { title, sub: [formatDateTime(it.updatedAt), preview].filter(Boolean).join('　') };
  },
};
