import { h } from '../core/dom.js';
import { daysSince } from '../core/date.js';
import { BACKUP_REMIND_DAYS } from '../config.js';

// バックアップの押し忘れ注意。必要ない時は null を返す。
export function backupBanner(ctx) {
  if (ctx.store.items().length === 0) return null;
  const last = ctx.store.getMeta('lastBackupAt');
  const days = last ? daysSince(last) : null;
  if (last && days < BACKUP_REMIND_DAYS) return null;
  const text = last ? `最後のバックアップから${days}日経っています` : 'まだバックアップしていません';
  return h('div', { class: 'banner' },
    h('span', null, text),
    h('button', { type: 'button', onclick: () => ctx.navigate('settings') }, 'バックアップ')
  );
}
