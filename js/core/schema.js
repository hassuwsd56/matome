// 保存データの形とバージョン管理
// データの形を変える時は SCHEMA_VERSION を上げ、migrations に変換処理を足す。
// こうしておくと、古いバックアップも新しいアプリで読み込める。
export const SCHEMA_VERSION = 1;

export function createEmptyData() {
  return { version: SCHEMA_VERSION, items: [], meta: { lastBackupAt: null } };
}

// key: 変換前のバージョン → 1つ上のバージョンのデータを返す
const migrations = {
  // 例: 1: (d) => ({ ...d, version: 2, items: d.items.map((it) => ({ ...it, tags: [] })) }),
};

export function migrate(input) {
  if (!input || typeof input !== 'object') throw new Error('データの形式が正しくありません');
  let d = JSON.parse(JSON.stringify(input));
  if (typeof d.version !== 'number') throw new Error('データの形式が正しくありません');
  if (d.version > SCHEMA_VERSION) throw new Error('新しいバージョンのアプリで作られたデータです');
  while (d.version < SCHEMA_VERSION) {
    const step = migrations[d.version];
    if (!step) throw new Error(`バージョン ${d.version} のデータは変換できません`);
    d = step(d);
  }
  if (!Array.isArray(d.items)) throw new Error('データの形式が正しくありません');
  d.meta = { lastBackupAt: null, ...(d.meta || {}) };
  return d;
}
