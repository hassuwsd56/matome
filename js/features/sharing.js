import { h } from '../core/dom.js';
import { formatDateJa, toDateStr } from '../core/date.js';
import { ROLE_LABEL } from '../core/cloud-store.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

// 共有カレンダーの色の候補
export const CAL_COLORS = ['#ff9f0a', '#bf5af2', '#ff375f', '#0fb5ae', '#5e5ce6', '#ac8e68'];

const tsToDate = (t) => (t?.toDate ? t.toDate() : new Date(t));

// 設定画面に出す「カレンダー」カード
export function sharingCard(ctx) {
  const store = ctx.store;
  const cals = store.calendars();
  return h('div', { class: 'card' },
    h('h2', null, 'カレンダー'),
    h('p', null, 'カレンダーは複数作れます。招待したカレンダーの予定は、招待した人と一緒に見られます（招待しなければ自分だけ）。タスク・メモは共有されません。'),
    cals.length
      ? h('div', { class: 'list cal-list' }, cals.map((c) =>
          h('button', { type: 'button', class: 'row', dataset: { cal: c.id }, onclick: () => openCalendarSheet(ctx, c.id) },
            h('span', { class: 'type-dot', style: `background:${c.color}` }),
            h('div', { class: 'row-main' },
              h('div', { class: 'row-title' }, c.name),
              h('div', { class: 'row-sub' }, `${c.memberIds.length > 1 ? `${c.memberIds.length}人で共有中` : '自分だけ'}・${ROLE_LABEL[store.roleIn(c.id)] || ''}`)),
            h('span', { class: 'chev' }, '›'))))
      : null,
    h('button', { type: 'button', class: 'btn primary', id: 'cal-create', onclick: () => openCreateSheet(ctx) }, '＋ カレンダーを作る')
  );
}

function colorPicker(selected, onPick) {
  return h('div', { class: 'color-picker' }, CAL_COLORS.map((c) =>
    h('button', {
      type: 'button', class: `color-dot${c === selected ? ' on' : ''}`, style: `background:${c}`, 'aria-label': `色 ${c}`,
      onclick: (e) => {
        e.currentTarget.parentElement.querySelectorAll('.color-dot').forEach((x) => x.classList.remove('on'));
        e.currentTarget.classList.add('on');
        onPick(c);
      },
    })));
}

export function openCreateSheet(ctx) {
  // まだ使っていない色を最初に選んでおく
  const used = new Set(ctx.store.calendars().map((c) => c.color));
  let color = CAL_COLORS.find((c) => !used.has(c)) || CAL_COLORS[0];
  const name = h('input', { id: 'cal-name', type: 'text', placeholder: '例: 家族', enterkeyhint: 'done' });
  const close = openSheet({
    title: 'カレンダーを作る',
    right: {
      label: '作成',
      onClick: async () => {
        const n = name.value.trim();
        if (!n) return toast('名前を入力してください');
        const cid = await ctx.store.createCalendar(n, color);
        close();
        toast(`「${n}」を作りました。招待すると共有できます`);
        openCalendarSheet(ctx, cid);
      },
    },
    build: (body) => body.append(h('div', { class: 'form' },
      h('div', { class: 'field' }, h('label', { for: 'cal-name' }, '名前'), name),
      h('div', { class: 'field' }, h('label', null, '色'), colorPicker(color, (c) => { color = c; }))
    )),
  });
  name.focus({ preventScroll: true });
}

async function shareLink(url, name) {
  const text = `まとめ帳の共有カレンダー「${name}」への招待です（7日間有効）`;
  if (navigator.share) {
    try { await navigator.share({ title: 'まとめ帳', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('リンクをコピーしました');
  } catch {
    toast('コピーできませんでした。リンクを長押ししてコピーしてください');
  }
}

// 共有カレンダーの管理（名前・色・メンバー・招待・退出・削除）
export function openCalendarSheet(ctx, cid) {
  const store = ctx.store;
  let lastLink = null;
  const close = openSheet({
    title: store.calendar(cid)?.name || 'カレンダー',
    className: 'cal-sheet',
    build: (body, close) => {
      const render = () => {
        const cal = store.calendar(cid);
        if (!cal) { close(); return; }
        const role = store.roleIn(cid);
        const isOwner = role === 'owner';
        const parts = [];

        if (isOwner) {
          const name = h('input', { id: 'cal-rename', type: 'text', value: cal.name, enterkeyhint: 'done' });
          parts.push(h('div', { class: 'form' },
            h('div', { class: 'field' }, h('label', { for: 'cal-rename' }, '名前'),
              h('div', { class: 'with-clear' }, name,
                h('button', { type: 'button', class: 'link-btn', onclick: () => {
                  const n = name.value.trim();
                  if (n && n !== cal.name) { store.updateCalendar(cid, { name: n }); toast('名前を変えました'); }
                } }, '保存'))),
            h('div', { class: 'field' }, h('label', null, '色'), colorPicker(cal.color, (c) => store.updateCalendar(cid, { color: c })))));
        } else {
          parts.push(h('p', { class: 'muted-text' }, `あなたの権限: ${ROLE_LABEL[role] || ''}`));
        }

        // メンバー
        parts.push(h('h3', { class: 'sub-head' }, cal.memberIds.length > 1 ? `メンバー（${cal.memberIds.length}人で共有中）` : 'メンバー（まだ自分だけ）'));
        parts.push(h('div', { class: 'list' }, cal.memberIds.map((uid) => {
          const r = cal.roles?.[uid];
          const label = `${cal.names?.[uid] || '（名前なし）'}${uid === store.uid ? '（自分）' : ''}`;
          let right;
          if (isOwner && r !== 'owner') {
            right = h('div', { class: 'member-actions' },
              h('select', {
                class: 'role-select', 'aria-label': `${label}の権限`,
                onchange: (e) => store.setMemberRole(cid, uid, e.target.value),
              }, ['editor', 'viewer'].map((v) => {
                const o = h('option', { value: v }, ROLE_LABEL[v]);
                if (v === r) o.selected = true;
                return o;
              })),
              h('button', { type: 'button', class: 'link-btn danger-text', onclick: () => {
                store.removeMember(cid, uid); toast(`${cal.names?.[uid] || 'メンバー'}さんを外しました`);
              } }, '外す'));
          } else {
            right = h('span', { class: 'row-sub' }, ROLE_LABEL[r] || '');
          }
          return h('div', { class: 'row member', dataset: { uid } }, h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, label)), right);
        })));

        // 招待（オーナーだけ）
        if (isOwner) {
          let inviteRole = 'editor';
          parts.push(h('h3', { class: 'sub-head' }, '招待する'));
          parts.push(h('div', { class: 'segmented invite-role' },
            ['editor', 'viewer'].map((v) => h('button', {
              type: 'button', class: `seg${v === inviteRole ? ' active' : ''}`, dataset: { role: v },
              onclick: (e) => {
                inviteRole = v;
                e.currentTarget.parentElement.querySelectorAll('.seg').forEach((x) => x.classList.toggle('active', x === e.currentTarget));
              },
            }, ROLE_LABEL[v]))));
          parts.push(h('button', {
            type: 'button', class: 'btn primary', id: 'invite-create',
            onclick: async () => {
              lastLink = await store.createInvite(cid, inviteRole);
              render();
              shareLink(lastLink.url, cal.name);
            },
          }, '招待リンクを作って送る'));
          if (lastLink) {
            parts.push(h('div', { class: 'invite-link' },
              h('input', { type: 'text', readonly: true, value: lastLink.url, id: 'invite-url', onclick: (e) => e.target.select() }),
              h('button', { type: 'button', class: 'link-btn', onclick: () => shareLink(lastLink.url, cal.name) }, '送る')));
          }
          parts.push(h('p', { class: 'hint' }, 'リンクは LINE などで送れます。相手がリンクを開いてログインすると参加できます（7日間有効）。'));

          const now = Date.now();
          const invites = Object.entries(cal.invites || {}).filter(([, v]) => tsToDate(v.expiresAt).getTime() > now);
          if (invites.length) {
            parts.push(h('div', { class: 'list' }, invites.map(([token, v]) =>
              h('div', { class: 'row', dataset: { invite: token } },
                h('div', { class: 'row-main' },
                  h('div', { class: 'row-title' }, `招待リンク（${ROLE_LABEL[v.role]}）`),
                  h('div', { class: 'row-sub' }, `${formatDateJa(toDateStr(tsToDate(v.expiresAt)))}まで有効`)),
                h('button', { type: 'button', class: 'link-btn danger-text', onclick: () => { store.removeInvite(cid, token); toast('招待リンクを取り消しました'); } }, '取り消す')))));
          }
        }

        // 退出・削除（マイカレンダーは消せない）
        if (cid !== store.defaultCalId) parts.push(dangerButton(
          isOwner ? 'このカレンダーを削除' : 'このカレンダーから抜ける',
          isOwner ? 'もう一度タップで削除（予定もすべて消えます）' : 'もう一度タップで抜ける',
          async () => {
            if (isOwner) await store.deleteCalendar(cid);
            else await store.leaveCalendar(cid);
            close();
            toast(isOwner ? '削除しました' : '抜けました');
          }));
        body.replaceChildren(...parts);
      };
      const unsub = store.subscribe(render);
      close.onClose(unsub);
      render();
    },
  });
  return close;
}

function dangerButton(label, armedLabel, action) {
  let armed = false;
  let timer;
  const btn = h('button', {
    type: 'button', class: 'danger-btn',
    onclick: () => {
      if (!armed) {
        armed = true;
        btn.textContent = armedLabel;
        timer = setTimeout(() => { armed = false; btn.textContent = label; }, 3000);
        return;
      }
      clearTimeout(timer);
      action();
    },
  }, label);
  return btn;
}

// 招待リンク（#/join/{cid}/{token}/{role}/{name}）を開いた時
export function parseJoinHash(hash = location.hash) {
  const m = hash.match(/^#\/join\/([^/]+)\/([^/]+)\/(editor|viewer)\/?(.*)$/);
  if (!m) return null;
  let name = '';
  try { name = decodeURIComponent(m[4] || ''); } catch { /* そのまま */ }
  return { cid: m[1], token: m[2], role: m[3], name };
}

export function handleJoin(ctx, info) {
  const store = ctx.store;
  const done = () => { history.replaceState(null, '', `${location.pathname}#/calendar`); ctx.rerender(); };
  if (store.calendar(info.cid)) {
    toast('すでに参加しています');
    done();
    return;
  }
  const close = openSheet({
    title: '共有カレンダーに参加',
    build: (body) => body.append(
      h('p', { class: 'join-text' }, `「${info.name || '共有カレンダー'}」に参加しますか？`),
      h('p', { class: 'muted-text' }, `あなたの権限: ${ROLE_LABEL[info.role]}`),
      h('button', {
        type: 'button', class: 'btn primary', id: 'join-ok',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            await store.joinCalendar(info.cid, info.token, info.role);
            close();
            toast(`「${info.name || '共有カレンダー'}」に参加しました`);
            done();
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            toast(err?.code === 'permission-denied' ? '招待リンクが無効か、期限が切れています' : '参加できませんでした。ネットにつながっているか確認してください');
          }
        },
      }, '参加する'),
      h('button', { type: 'button', class: 'btn', onclick: () => { close(); done(); } }, 'やめる')
    ),
  });
}
