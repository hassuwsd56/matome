// 日付は "YYYY-MM-DD" の文字列で扱う（タイムゾーンのずれを避けるため）
const pad = (n) => String(n).padStart(2, '0');
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => toDateStr(new Date());

export function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function formatDateJa(s, { weekday = true } = {}) {
  const d = parseDateStr(s);
  return `${d.getMonth() + 1}月${d.getDate()}日${weekday ? `（${WEEKDAYS[d.getDay()]}）` : ''}`;
}

// ISO 日時文字列 → "11月3日 14:05"
export function formatDateTime(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const isTodayIso = (iso) => !!iso && toDateStr(new Date(iso)) === todayStr();

// ISO 日時から今日まで何日経ったか（日付単位）
export function daysSince(iso) {
  const from = parseDateStr(toDateStr(new Date(iso)));
  const to = parseDateStr(todayStr());
  return Math.round((to - from) / 86400000);
}

export { WEEKDAYS };
