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
    const hiddenBelow = vv ? Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)) : 0;
    sheet.style.bottom = `${hiddenBelow}px`;
    sheet.style.maxHeight = `calc(${height}px - var(--safe-top) - 16px)`;
    sheet.style.height = fill() ? sheet.style.maxHeight : '';
  };
  update();
  const stop = () => {
    vv?.removeEventListener('resize', update);
    vv?.removeEventListener('scroll', update);
  };
  stop.update = update;
  vv?.addEventListener('resize', update);
  vv?.addEventListener('scroll', update);
  return stop;
}
