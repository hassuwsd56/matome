import { addDays, formatDateJa, parseDateStr, todayStr } from '../core/date.js';

// 終了日（前の版のデータには無いので、無ければ開始日と同じ日）
export const endDateOf = (it) => (it.endDate && it.endDate >= it.date ? it.endDate : it.date);
export const isMultiDay = (it) => endDateOf(it) !== it.date;

const md = (s) => formatDateJa(s, { weekday: false });

function timeRange(it) {
  if (isMultiDay(it)) {
    const a = [md(it.date), it.allDay ? '' : it.startTime].filter(Boolean).join(' ');
    const b = [md(endDateOf(it)), it.allDay ? '' : it.endTime].filter(Boolean).join(' ');
    return `${a} 〜 ${b}${it.allDay ? '（終日）' : ''}`;
  }
  if (it.allDay) return '終日';
  const t = [it.startTime, it.endTime].filter(Boolean).join(' – ');
  return t || '時間未定';
}

// "HH:MM" に分を足す（日をまたぐ時は 23:59 で止める）
function addMinutes(t, n) {
  const [hh, mm] = t.split(':').map(Number);
  const m = Math.min(hh * 60 + mm + n, 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// 予定
export default {
  id: 'event',
  label: '予定',
  color: 'var(--c-event)',

  // 入力フォームの項目（ここに足すと入力画面に自動で出る）
  // group が同じ項目は 1 行に並ぶ（開始日＋開始時刻、終了日＋終了時刻）
  fields: [
    { key: 'title', label: 'タイトル', input: 'text', required: true, placeholder: '例: 歯医者' },
    // 入れるカレンダー（ログインしている時だけ表示。編集できるカレンダーだけ選べる）
    {
      key: 'calendarId', label: 'カレンダー', input: 'select', default: (ctx) => ctx.calendarId || '',
      options: (store, item) => {
        if (!store.isCloud) return [];
        const opts = store.calendars()
          .filter((c) => ['owner', 'editor'].includes(store.roleIn(c.id)) || c.id === item?.calendarId)
          .map((c) => ({ value: c.id, label: c.name }));
        // マイカレンダーがまだ作られていない時（初回・電波なし）は、仮の選択肢を出す
        if (!store.defaultCalendarId()) opts.unshift({ value: '', label: 'マイカレンダー' });
        return opts;
      },
    },
    { key: 'color', label: '色', input: 'color', autoLabel: 'カレンダーの色', default: '' },
    { key: 'allDay', label: '終日', input: 'toggle', default: false },
    { key: 'date', label: '開始日', input: 'date', required: true, group: 'start', groupLabel: '開始', default: (ctx) => ctx.date || todayStr() },
    { key: 'startTime', label: '開始時刻', input: 'time', group: 'start', hiddenWhen: (v) => v.allDay },
    { key: 'endDate', label: '終了日', input: 'date', required: true, group: 'end', groupLabel: '終了', default: (ctx) => ctx.date || todayStr() },
    { key: 'endTime', label: '終了時刻', input: 'time', group: 'end', hiddenWhen: (v) => v.allDay },
    { key: 'note', label: 'メモ', input: 'textarea', rows: 3 },
  ],

  // 前の版で作った予定（終了日なし）を開いた時に補う
  normalize: (v) => ({ ...v, endDate: endDateOf(v) }),

  // 入力中の自動調整: 開始を後ろにずらしたら、終了も同じだけずらす
  onFieldChange(key, v, prev) {
    if (key === 'date' && v.date) {
      // 期間の長さを保ったまま終了日を動かす
      if (prev && v.endDate && v.endDate >= prev) {
        const days = Math.round((parseDateStr(v.date) - parseDateStr(prev)) / 86400000);
        return { endDate: addDays(v.endDate, days) };
      }
      if (!v.endDate || v.endDate < v.date) return { endDate: v.date };
    }
    if (key === 'startTime' && v.startTime && v.endDate === v.date && (!v.endTime || v.endTime < v.startTime)) {
      return { endTime: addMinutes(v.startTime, 60) };
    }
    return null;
  },

  validate(v) {
    if (v.endDate < v.date) return '終了日は開始日以降にしてください';
    if (!v.allDay && v.endDate === v.date && v.startTime && v.endTime && v.endTime < v.startTime) return '終了は開始より後にしてください';
    return null;
  },

  beforeSave(data) {
    if (!data.endDate) data.endDate = data.date;
    return data;
  },

  // カレンダーのその日に出すか（開始日〜終了日）
  occursOn: (it, date) => it.date <= date && date <= endDateOf(it),
  // カレンダーで帯にする期間
  span: (it) => [it.date, endDateOf(it)],

  // 並び順: 複数日 → 終日 → 時間あり（早い順） → 時間未定
  sortKey: (it) => (isMultiDay(it) ? `0${it.date}` : it.allDay ? '1' : it.startTime ? `2${it.startTime}` : '3'),

  rowInfo: (it) => ({ title: it.title, sub: timeRange(it) }),

  // 2 人以上で共有しているカレンダーの予定なら、入れた人の名前（それ以外は null）
  createdByName(it, store) {
    const cal = it.calendarId && store.calendar?.(it.calendarId);
    if (!cal || (cal.memberIds?.length || 0) < 2 || !it.createdBy) return null;
    return cal.names?.[it.createdBy] || null;
  },

  // 「今日」画面に出すセクション
  todaySections: [
    { title: '予定', order: 10, filter: (it, today) => it.date <= today && today <= endDateOf(it), empty: '今日の予定はありません' },
  ],
};
