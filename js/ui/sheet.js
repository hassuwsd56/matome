// 下から出るシートの共通部分（入力シート・その日の一覧シートで使う）

// シート表示中は背面ページを固定する（iPhone では overflow:hidden だけでは背面がスクロールする）
let lockedY = null;
export function lockScroll() {
  if (lockedY !== null) return;
  lockedY = window.scrollY;
  Object.assign(document.body.style, { position: 'fixed', top: `-${lockedY}px`, left: '0', right: '0', width: '100%' });
}
export function unlockScroll() {
  if (lockedY === null) return;
  const y = lockedY;
  lockedY = null;
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', width: '' });
  window.scrollTo(0, y);
}

// キーボードが出たら、シートを「見えている範囲（キーボードの上）」に収める。
// iPhone はキーボード表示時に画面全体を上へずらすため、そのままだとシート上部が画面外に出てしまう。
// fill() が true の間は、見えている範囲いっぱいの高さに固定する（メモの本文欄を広げるため）。
// 戻り値の関数を呼ぶと追従をやめる。.update() で今の状態に合わせ直せる。
export function fitToVisibleArea(sheet, { fill = () => false } = {}) {
  const vv = window.visualViewport;
  const update = () => {
    const height = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    if (fill()) {
      // メモ: 見えている範囲の「上端」に合わせて置き、高さも見えている範囲に固定する。
      // iPhone が入力中に画面を少し動かしても（offsetTop が変わっても）、本文欄がキーボードの裏に入らない。
      sheet.style.top = `calc(${top}px + var(--safe-top) + 8px)`;
      sheet.style.bottom = 'auto';
      sheet.style.height = `calc(${height}px - var(--safe-top) - 8px)`;
      sheet.style.maxHeight = sheet.style.height;
    } else {
      // 画面の高さはキーボードで変わらない値（レイアウトの高さ）を使う
      const layoutH = document.documentElement.clientHeight || window.innerHeight;
      sheet.style.top = '';
      sheet.style.bottom = `${Math.max(0, layoutH - (top + height))}px`;
      sheet.style.maxHeight = `calc(${height}px - var(--safe-top) - 16px)`;
      sheet.style.height = '';
    }
  };
  // キーボードが出る途中でも追いつくよう、入力欄に触れた直後にも数回合わせ直す
  const onFocus = () => { update(); setTimeout(update, 100); setTimeout(update, 400); };
  update();
  const stop = () => {
    vv?.removeEventListener('resize', update);
    vv?.removeEventListener('scroll', update);
    sheet.removeEventListener('focusin', onFocus);
  };
  stop.update = update;
  vv?.addEventListener('resize', update);
  vv?.addEventListener('scroll', update);
  sheet.addEventListener('focusin', onFocus);
  return stop;
}

// 汎用のシート。build(body, close) で中身を作る。right: { label, onClick } で右上のボタン。
export function openSheet({ title, right = null, className = '', build }) {
  const root = document.getElementById('sheet-root');
  const sheet = document.createElement('div');
  sheet.className = `sheet ${className}`.trim();
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const openedAt = Date.now();
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  backdrop.addEventListener('click', () => { if (Date.now() - openedAt > 400) close(); });
  root.replaceChildren(backdrop, sheet);
  document.body.classList.add('sheet-open');
  lockScroll();
  const fitting = fitToVisibleArea(sheet);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));

  let closed = false;
  const onClose = new Set();
  function close() {
    if (closed) return;
    closed = true;
    for (const fn of onClose) fn();
    document.activeElement?.blur?.();
    fitting();
    root.classList.remove('open');
    document.body.classList.remove('sheet-open');
    unlockScroll();
    setTimeout(() => { if (!root.classList.contains('open')) root.replaceChildren(); }, 300);
  }
  close.onClose = (fn) => onClose.add(fn);

  const header = document.createElement('div');
  header.className = 'sheet-header';
  const mkBtn = (label, cls, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  };
  const t = document.createElement('div');
  t.className = 'sheet-title';
  t.textContent = title;
  header.append(
    mkBtn('閉じる', 'link-btn', close),
    t,
    right ? mkBtn(right.label, 'link-btn strong', right.onClick) : document.createElement('span')
  );
  const body = document.createElement('div');
  body.className = 'sheet-body';
  sheet.append(header, body);
  build(body, close);
  return close;
}
