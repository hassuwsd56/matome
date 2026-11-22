import { Store } from './core/store.js';
import { localStorageAdapter } from './core/storage/local-storage.js';
import { h } from './core/dom.js';
import './types/index.js';
import { views } from './views/index.js';
import { openEditor } from './ui/editor.js';
import { toast } from './ui/toast.js';

// 保存先を変える時はここのアダプターを差し替える
const store = new Store(localStorageAdapter);

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const tabbar = document.getElementById('tabbar');
const fab = document.getElementById('fab');

let current = null;

// 各画面に渡す道具一式
const ctx = {
  store,
  openEditor: (opts) => openEditor(store, opts),
  navigate: (id) => { location.hash = `#/${id}`; },
  rerender: () => render({ keepScroll: true }),
};

function currentView() {
  const id = location.hash.replace(/^#\/?/, '');
  return views.find((v) => v.id === id) || views[0];
}

function render({ keepScroll = false } = {}) {
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

async function main() {
  try {
    await store.init();
  } catch (e) {
    console.error(e);
    toast('データの読み込みに失敗しました');
  }
  navigator.storage?.persist?.().catch(() => {});

  tabbar.append(...views.map((v) =>
    h('a', { href: `#/${v.id}`, class: 'tab', dataset: { view: v.id } },
      h('span', { html: v.icon }), h('span', { class: 'tab-label' }, v.label))));

  fab.addEventListener('click', () =>
    ctx.openEditor({ typeId: current.fabType, ctx: current.fabContext?.() || {} }));

  window.addEventListener('hashchange', () => render());
  store.subscribe(() => render({ keepScroll: true }));
  // 日付が変わった後にアプリへ戻った時、「今日」を更新する
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render({ keepScroll: true });
  });

  render();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW 登録失敗', e));
  }
}

main();
