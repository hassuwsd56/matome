import { h } from '../core/dom.js';
import { migrate } from '../core/schema.js';

const APP_ID = 'matome';

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// バックアップを書き出す。iPhone では共有シートが開き「"ファイル"に保存」で iCloud Drive などに保存できる。
// 戻り値: 書き出したら true、キャンセルされたら false
export async function exportBackup(store) {
  const now = new Date();
  const data = store.snapshot();
  data.meta.lastBackupAt = now.toISOString();
  const json = JSON.stringify({ app: APP_ID, exportedAt: now.toISOString(), data }, null, 2);
  const name = `matome-backup-${stamp(now)}.json`;
  const file = new File([json], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e.name === 'AbortError') return false;
      throw e;
    }
  } else {
    // PC のブラウザなど: 普通にダウンロード
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  await store.setMeta('lastBackupAt', now.toISOString());
  return true;
}

// バックアップファイルの中身を読み取り、検証済みのデータを返す（失敗時は例外）
export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('バックアップファイルではありません');
  }
  if (obj?.app === APP_ID && obj.data) return migrate(obj.data);
  if (obj?.version && Array.isArray(obj.items)) return migrate(obj);
  throw new Error('バックアップファイルではありません');
}
