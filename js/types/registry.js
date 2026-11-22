// アイテムの種類（予定・タスク・メモ…）の登録所
// 新しい種類を足す時は types/ にファイルを作り、types/index.js で登録するだけ。
const types = new Map();

export function registerType(def) {
  types.set(def.id, def);
}

export const getType = (id) => types.get(id);
export const allTypes = () => [...types.values()];

// 種類ごとの並び順で比較する関数
export function compareItems(a, b) {
  const order = allTypes().map((t) => t.id);
  const byType = order.indexOf(a.type) - order.indexOf(b.type);
  if (byType) return byType;
  const ta = getType(a.type);
  const ka = ta?.sortKey?.(a) ?? '';
  const kb = ta?.sortKey?.(b) ?? '';
  return ka.localeCompare(kb) || (a.createdAt || '').localeCompare(b.createdAt || '');
}
