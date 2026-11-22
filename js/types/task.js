import { formatDateJa, isTodayIso, todayStr } from '../core/date.js';

// 完了したタスクは、完了した当日だけ「今日」画面に残す（取り消せるように）
const visibleToday = (it) => !it.done || isTodayIso(it.doneAt);

// タスク
export default {
  id: 'task',
  label: 'タスク',
  color: 'var(--c-task)',
  checkable: true,

  fields: [
    { key: 'title', label: 'タイトル', input: 'text', required: true, placeholder: '例: 書類を出す' },
    { key: 'due', label: '期限', input: 'date', default: (ctx) => ctx.date || '' },
    { key: 'done', label: '完了', input: 'toggle', default: false },
    { key: 'note', label: 'メモ', input: 'textarea', rows: 3 },
  ],

  // 保存前の調整: 完了日時を記録
  beforeSave(data, prev) {
    if (data.done && !prev?.done) data.doneAt = new Date().toISOString();
    if (!data.done) data.doneAt = null;
    return data;
  },

  toggleDone: (it) => (it.done ? { done: false, doneAt: null } : { done: true, doneAt: new Date().toISOString() }),

  occursOn: (it, date) => it.due === date,
  // カレンダーで帯にする期間（期限の日だけ）
  span: (it) => [it.due, it.due],

  sortKey: (it) => `${it.done ? 1 : 0}${it.due || '9999-99-99'}`,

  rowInfo(it, opts = {}) {
    const today = todayStr();
    const overdue = !it.done && it.due && it.due < today;
    let sub = '';
    if (it.due && overdue) sub = `期限切れ・${formatDateJa(it.due)}`;
    else if (it.due && !(opts.context === 'today' && it.due === today)) sub = `期限 ${formatDateJa(it.due)}`;
    return { title: it.title, sub, tone: overdue ? 'overdue' : '' };
  },

  todaySections: [
    {
      // 期限切れ・今日・今後のタスクをすべて期限順に表示
      title: 'タスク',
      order: 20,
      filter: (it) => it.due && visibleToday(it),
      empty: '期限のあるタスクはありません',
    },
    {
      title: '期限なしのタスク',
      order: 30,
      filter: (it) => !it.due && visibleToday(it),
      empty: null, // 空なら表示しない
    },
  ],
};
