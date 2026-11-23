// 予定に選べる色
export const EVENT_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#0fb5ae', '#5e5ce6', '#ac8e68', '#8e8e93'];

// 予定の表示色: 予定に選んだ色 → カレンダーの色 → 種類の色
export const itemColor = (item, store, type) =>
  item.color || (item.calendarId && store.calendar?.(item.calendarId)?.color) || type.color;
