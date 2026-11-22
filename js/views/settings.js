import { h, compact } from '../core/dom.js';
import { formatDateTime } from '../core/date.js';
import { allTypes } from '../types/registry.js';
import { exportBackup, parseBackup } from '../features/backup.js';
import { toast } from '../ui/toast.js';
import { ICONS } from '../ui/icons.js';
import { APP_NAME, APP_VERSION } from '../config.js';
import { sharingCard } from '../features/sharing.js';

const countText = (items) =>
  allTypes().map((t) => `${t.label} ${items.filter((i) => i.type === t.id).length}件`).join('・');

// 設定画面: アカウント・共有カレンダー・バックアップの書き出し・復元
export default {
  id: 'settings',
  label: '設定',
  icon: ICONS.settings,
  title: '設定',
  fab: false,

  render(el, ctx) {
    const last = ctx.store.getMeta('lastBackupAt');
    const restoreArea = h('div');

    const showConfirm = (data) => {
      restoreArea.replaceChildren(h('div', { class: 'confirm-box' },
        h('p', null, `このファイルの中身: ${countText(data.items)}`),
        h('p', { class: 'warn' }, '今のデータはすべて置き換わります。'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', onclick: () => restoreArea.replaceChildren() }, 'やめる'),
          h('button', {
            type: 'button', class: 'btn danger',
            onclick: async () => {
              try {
                await ctx.store.replaceAll(data);
                toast('復元しました');
              } catch (e) {
                toast(e.message || '復元に失敗しました');
              }
            },
          }, '復元する')
        )
      ));
    };

    const fileInput = h('input', {
      type: 'file', accept: 'application/json,.json', hidden: true,
      onchange: async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
          showConfirm(parseBackup(await file.text()));
        } catch (err) {
          toast(err.message);
        }
      },
    });

    const store = ctx.store;
    const account = store.isCloud
      ? h('div', { class: 'card' },
          h('h2', null, 'アカウント'),
          h('p', null, `ログイン中: ${store.user.email}`),
          h('div', { class: 'field' }, h('label', { for: 'my-name' }, '表示名（共有カレンダーで相手に見える名前）'),
            h('div', { class: 'with-clear' },
              h('input', { id: 'my-name', type: 'text', value: store.name, enterkeyhint: 'done' }),
              h('button', { type: 'button', class: 'link-btn', onclick: () => {
                const n = document.getElementById('my-name').value.trim();
                if (n) { store.setName(n); toast('表示名を変えました'); }
              } }, '保存'))),
          h('button', { type: 'button', class: 'btn', id: 'logout', onclick: () => ctx.logout() }, 'ログアウト'))
      : h('div', { class: 'card' },
          h('h2', null, 'アカウント'),
          h('p', null, 'ログインせずに使っています（データはこの端末の中だけ）。'),
          h('p', null, 'ログインすると、iPhone と PC で同じデータを見られ、共有カレンダーも使えます。今のデータはクラウドに移ります。'),
          h('button', { type: 'button', class: 'btn primary', id: 'go-login', onclick: () => ctx.goLogin() }, 'ログイン / 登録する'));

    el.append(...compact(
      account,
      store.isCloud ? sharingCard(ctx) : null,
      h('div', { class: 'card' },
        h('h2', null, 'バックアップ'),
        h('p', null, `最後のバックアップ: ${last ? formatDateTime(last) : 'まだありません'}`),
        h('p', null, `保存中のデータ: ${countText(ctx.store.items())}`),
        h('button', {
          type: 'button', class: 'btn primary',
          onclick: async () => {
            try {
              if (await exportBackup(ctx.store)) toast('バックアップしました');
            } catch (e) {
              console.error(e);
              toast('書き出しに失敗しました');
            }
          },
        }, 'バックアップを書き出す'),
        h('p', { class: 'hint' }, '共有メニューから「"ファイル"に保存」を選ぶと、iCloud Drive などに保存できます。')
      ),
      h('div', { class: 'card' },
        h('h2', null, '復元'),
        h('p', null, '書き出したバックアップファイルからデータを戻します。'),
        h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, 'ファイルを選ぶ'),
        fileInput,
        restoreArea
      ),
      h('div', { class: 'card' },
        h('h2', null, 'データについて'),
        h('p', null, store.isCloud
          ? 'データはクラウド（Firebase）に保存され、ログインした端末どうしで自動で同期されます。電波がない時に変えた内容は、つながった時に送られます。'
          : 'データはこの端末の中だけに保存されています。ホーム画面からアプリを削除するとデータも消えるので、定期的にバックアップしてください。'),
        h('p', { class: 'hint' }, `${APP_NAME} v${APP_VERSION}`)
      )
    ));
  },
};
