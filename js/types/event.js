import { todayStr } from '../core/date.js';

const timeRange = (it) => {
  if (it.allDay) return '終日';
  const t = [it.startTime, it.endTime].filter(Boolean).join(' – ');
  return t || '時間未定';
};

// 予定
export default {
  id: 'event',
  label: '予定',
  color: 'var(--c-event)',

  // 入力フォームの項目（ここに足すと入力画面に自動で出る）
  fields: [
    { key: 'title', label: 'タイトル', input: 'text', required: true, placeholder: '例: 歯医者' },
    { key: 'date', label: '日付', input: 'date', required: true, default: (ctx) => ctx.date || todayStr() },
    { key: 'allDay', label: '終日', input: 'toggle', default: false },
    { key: 'startTime', label: '開始', input: 'time', hiddenWhen: (v) => v.allDay },
    { key: 'endTime', label: '終了', input: 'time', hiddenWhen: (v) => v.allDay },
    { key: 'note', label: 'メモ', input: 'textarea', rows: 3 },
  ],

  validate(v) {
    if (!v.allDay && v.startTime && v.endTime && v.endTime < v.startTime) return '終了は開始より後にしてください';
    return null;
  },

  // カレンダーのその日に出すか
  occursOn: (it, date) => it.date === date,

  // 並び順: 終日 → 時間あり（早い順） → 時間未定
  sortKey: (it) => (it.allDay ? '0' : it.startTime ? `1${it.startTime}` : '2'),

  rowInfo: (it) => ({ title: it.title, sub: timeRange(it) }),

  // 「今日」画面に出すセクション
  todaySections: [
    { title: '予定', order: 10, filter: (it, today) => it.date === today, empty: '今日の予定はありません' },
  ],
};
