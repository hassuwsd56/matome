// 日本の祝日（2020年以降の祝日法に対応。振替休日・国民の休日を含む）
// 年ごとに計算してキャッシュする。
import { addDays, parseDateStr } from './date.js';

const pad = (n) => String(n).padStart(2, '0');
const cache = new Map();

// その月の第 n 月曜日の日付
const nthMonday = (y, m, n) => 1 + ((8 - new Date(y, m - 1, 1).getDay()) % 7) + (n - 1) * 7;

// 春分・秋分の日（1980〜2099年で有効な近似式）
const vernal = (y) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const autumnal = (y) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

function baseHolidays(y) {
  const map = new Map();
  const add = (m, d, name) => map.set(`${y}-${pad(m)}-${pad(d)}`, name);
  add(1, 1, '元日');
  add(1, nthMonday(y, 1, 2), '成人の日');
  add(2, 11, '建国記念の日');
  if (y >= 2020) add(2, 23, '天皇誕生日');
  add(3, vernal(y), '春分の日');
  add(4, 29, '昭和の日');
  add(5, 3, '憲法記念日');
  add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');
  if (y === 2020) {
    add(7, 23, '海の日'); add(7, 24, 'スポーツの日'); add(8, 10, '山の日');
  } else if (y === 2021) {
    add(7, 22, '海の日'); add(7, 23, 'スポーツの日'); add(8, 8, '山の日');
  } else {
    add(7, nthMonday(y, 7, 3), '海の日');
    if (y >= 2016) add(8, 11, '山の日');
    add(10, nthMonday(y, 10, 2), y >= 2020 ? 'スポーツの日' : '体育の日');
  }
  add(9, nthMonday(y, 9, 3), '敬老の日');
  add(9, autumnal(y), '秋分の日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');
  return map;
}

function holidaysOf(y) {
  if (cache.has(y)) return cache.get(y);
  const base = baseHolidays(y);
  const map = new Map(base);
  const days = [...base.keys()].sort();

  // 国民の休日: 祝日に挟まれた日（日曜を除く）
  for (const ds of days) {
    const mid = addDays(ds, 1);
    if (base.has(addDays(ds, 2)) && !base.has(mid) && parseDateStr(mid).getDay() !== 0) map.set(mid, '国民の休日');
  }
  // 振替休日: 祝日が日曜なら、その後の最初の祝日でない日
  for (const ds of days) {
    if (parseDateStr(ds).getDay() !== 0) continue;
    let d = addDays(ds, 1);
    while (map.has(d)) d = addDays(d, 1);
    map.set(d, '振替休日');
  }
  cache.set(y, map);
  return map;
}

// "YYYY-MM-DD" → 祝日名（祝日でなければ null）
export const holidayName = (ds) => holidaysOf(Number(ds.slice(0, 4))).get(ds) || null;

// その年の祝日一覧（日付順の [日付, 名前] 配列）
export const holidaysInYear = (y) => [...holidaysOf(y)].sort((a, b) => a[0].localeCompare(b[0]));
