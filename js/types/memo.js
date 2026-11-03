import { formatDateTime } from '../core/date.js';

// メモ（カレンダーや「今日」には出さず、メモ画面だけで扱う）
export default {
  id: 'memo',
  label: 'メモ',
  color: 'var(--c-memo)',

  fields: [
    { key: 'title', label: 'タイトル', input: 'text', placeholder: '（省略可）' },
    { key: 'body', label: '本文', input: 'textarea', rows: 10 },
  ],

  validate: (v) => (!v.title && !(v.body || '').trim() ? 'タイトルか本文を入力してください' : null),

  rowInfo(it) {
    const lines = (it.body || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const title = it.title || lines[0] || '（無題）';
    const preview = it.title ? lines[0] : lines[1];
    return { title, sub: [formatDateTime(it.updatedAt), preview].filter(Boolean).join('　') };
  },
};
