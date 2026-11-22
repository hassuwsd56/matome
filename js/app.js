import { Store } from './core/store.js';
import { localStorageAdapter } from './core/storage/local-storage.js';
import { CloudStore } from './core/cloud-store.js';
import { loadFirebase } from './core/firebase.js';
import { h } from './core/dom.js';
import './types/index.js';
import { views } from './views/index.js';
import { openEditor } from './ui/editor.js';
import { toast } from './ui/toast.js';
import { showAuthScreen, hideAuthScreen } from './features/auth-screen.js';
import { parseJoinHash, handleJoin } from './features/sharing.js';

// 保存のしかた: 'local'（この端末だけ）か、未設定（ログインしてクラウドに保存）
const MODE_KEY = 'matome:mode';
const LOCAL_DATA_KEY = 'matome:data';

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const tabbar = document.getElementById('tabbar');
const fab = document.getElementById('fab');

let current = null;

// 各画面に渡す道具一式（store はログイン状態に応じて差し替わる）
const ctx = {
  store: null,
  fb: null,
  openEditor: (opts) => openEditor(ctx.store, opts),
  navigate: (id) => { location.hash = `#/${id}`; },
  rerender: () => render({ keepScroll: true }),
  // ログインせずに使っている時に、ログイン画面へ
  goLogin: () => { localStorage.removeItem(MODE_KEY); location.reload(); },
  logout: async () => {
    const fb = ctx.fb;
    ctx.store?.dispose?.();
    await fb.A.signOut(fb.auth);
    // この端末に残ったクラウドのデータのコピーを消す（共用の PC などのため）
    try { await fb.F.terminate(fb.db); await fb.F.clearIndexedDbPersistence(fb.db); } catch (e) { console.warn(e); }
    location.reload();
  },
};

function currentView() {
  const id = location.hash.replace(/^#\/?/, '');
  return views.find((v) => v.id === id) || views[0];
}

function render({ keepScroll = false } = {}) {
  if (!ctx.store) return;
  const view = currentView();
  const changed = view !== current;
  current = view;
  const y = window.scrollY;

  titleEl.textContent = typeof view.title === 'function' ? view.title(ctx) : view.title;
  document.title = titleEl.textContent;
  for (const tab of tabbar.children) tab.classList.toggle('active', tab.dataset.view === view.id);
  fab.hidden = view.fab === false;
  // 画面ごとの見た目の切り替え用（カレンダーは見出しを隠して画面いっぱいに表示）
  document.body.dataset.view = view.id;
  document.body.classList.toggle('full-screen', !!view.fullScreen);

  viewEl.replaceChildren();
  view.render(viewEl, ctx);
  window.scrollTo(0, keepScroll && !changed ? y : 0);
}

let started = false;
function start(store) {
  ctx.store = store;
  hideAuthScreen();
  if (!started) {
    started = true;
    tabbar.append(...views.map((v) =>
      h('a', { href: `#/${v.id}`, class: 'tab', dataset: { view: v.id } },
        h('span', { html: v.icon }), h('span', { class: 'tab-label' }, v.label))));
    fab.addEventListener('click', () =>
      ctx.openEditor({ typeId: current.fabType, ctx: current.fabContext?.() || {} }));
    window.addEventListener('hashchange', () => {
      const join = parseJoinHash();
      if (join) return openJoin(join);
      render();
    });
    // 日付が変わった後にアプリへ戻った時、「今日」を更新する
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') render({ keepScroll: true });
    });
  }
  store.subscribe(() => render({ keepScroll: true }));
  render();
  const join = parseJoinHash();
  if (join) openJoin(join);
}

function openJoin(info) {
  if (!ctx.store?.isCloud) {
    toast('共有カレンダーに参加するにはログインが必要です');
    history.replaceState(null, '', `${location.pathname}#/settings`);
    render();
    return;
  }
  handleJoin(ctx, info);
}

async function startLocal() {
  const store = new Store(localStorageAdapter);
  try {
    await store.init();
  } catch (e) {
    console.error(e);
    toast('データの読み込みに失敗しました');
  }
  start(store);
}

async function startCloud(fb, user) {
  // 登録したばかりの時: 入力した表示名を反映してから始める
  const pendingName = localStorage.getItem('matome:pendingName');
  if (pendingName) {
    localStorage.removeItem('matome:pendingName');
    if (!user.displayName) await fb.A.updateProfile(user, { displayName: pendingName }).catch(() => {});
  }
  const store = new CloudStore(fb, user);
  await store.init();
  // ログイン前にこの端末で使っていたデータを、初回だけクラウドへ移す
  const flag = `matome:migrated:${user.uid}`;
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_DATA_KEY) || 'null');
    if (raw?.items?.length && !localStorage.getItem(flag)) {
      const n = await store.importLocal(raw.items);
      toast(`この端末のデータ ${n} 件をクラウドに移しました`);
    }
    localStorage.setItem(flag, new Date().toISOString());
  } catch (e) {
    console.error(e);
  }
  start(store);
}

async function main() {
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW 登録失敗', e));
  }

  if (localStorage.getItem(MODE_KEY) === 'local') return startLocal();

  let fb;
  try {
    fb = await loadFirebase();
  } catch (e) {
    console.error(e);
    viewEl.replaceChildren(h('div', { class: 'card' },
      h('h2', null, '読み込めませんでした'),
      h('p', null, 'ネットにつながっているか確認して、アプリを開き直してください。'),
      h('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, 'もう一度読み込む')));
    return;
  }
  ctx.fb = fb;
  await fb.auth.authStateReady();
  let cloudStarted = false;
  fb.A.onAuthStateChanged(fb.auth, async (user) => {
    if (user && !cloudStarted) {
      cloudStarted = true;
      await startCloud(fb, user);
    } else if (!user && cloudStarted) {
      location.reload(); // 別のタブでログアウトした時など
    } else if (!user) {
      showAuthScreen(fb, {
        onLocal: () => { localStorage.setItem(MODE_KEY, 'local'); location.reload(); },
      });
    }
  });
}

main();
