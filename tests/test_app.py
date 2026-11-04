"""まとめ帳のテスト（iPhone 390x844 をヘッドレス Edge で再現）

実行: "/c/Users/skyio/anaconda3/python.exe" tests/test_app.py
別フォルダの版（修正前など）を試す時: APP_DIR=<フォルダ> を付けて実行
"""
import json, os, sys
from datetime import date, timedelta

sys.path.insert(0, os.path.expanduser("~/.claude/skills/webapp-test/scripts"))
from cdp import Browser, Checker, serve

APP_DIR = os.environ.get("APP_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(os.environ.get("TEMP", "."), "webapp-test-shots", "matome")
KEY = "matome:data"

today = date.today()
d = lambda n: (today + timedelta(days=n)).isoformat()
NOW = f"{today.isoformat()}T09:00:00.000Z"
YESTERDAY = f"{d(-1)}T09:00:00.000Z"


def item(id, type, **kw):
    return {"id": id, "type": type, "createdAt": NOW, "updatedAt": NOW, **kw}


SEED = {KEY: {"version": 1, "meta": {"lastBackupAt": None}, "items": [
    item("e1", "event", title="架空の会議", date=d(0), allDay=False, startTime="10:00", endTime="11:00", note=""),
    item("t1", "task", title="期限切れタスク", due=d(-2), done=False, note=""),
    item("t2", "task", title="今日のタスク", due=d(0), done=False, note=""),
    item("t3", "task", title="3日後のタスク", due=d(3), done=False, note=""),
    item("t4", "task", title="30日後のタスク", due=d(30), done=False, note=""),
    item("t5", "task", title="昨日完了したタスク", due=d(1), done=True, doneAt=YESTERDAY, note=""),
    item("t6", "task", title="期限なしタスク", due="", done=False, note=""),
    item("m1", "memo", title="架空のメモ", body="本文の1行目"),
]}}

# visualViewport を差し替えて、iPhone のキーボード表示（見える範囲が縮む）を再現する
FAKE_VV = """
(() => {
  const vv = new EventTarget();
  Object.assign(vv, { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
  Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
  window.__vv = vv;
})();
"""

# 祝日の正解（内閣府の公表どおり）
HOLIDAYS = {
    2025: ["01-01", "01-13", "02-11", "02-23", "02-24", "03-20", "04-29", "05-03", "05-04", "05-05", "05-06",
           "07-21", "08-11", "09-15", "09-23", "10-13", "11-03", "11-23", "11-24"],
    2026: ["01-01", "01-12", "02-11", "02-23", "03-20", "04-29", "05-03", "05-04", "05-05", "05-06",
           "07-20", "08-11", "09-21", "09-22", "09-23", "10-12", "11-03", "11-23"],
}

SECTION_TITLES = """(name) => {
  const s = [...document.querySelectorAll('.section')].find(x => x.querySelector('h2')?.textContent === name);
  return s ? [...s.querySelectorAll('.row-title')].map(e => e.textContent) : null;
}"""

ck = Checker()
base = serve(APP_DIR)
with Browser() as b:
    b.cmd("Page.addScriptToEvaluateOnNewDocument", source=FAKE_VV)
    b.open(base + "index.html#/today", seed=SEED)

    # ---------- 既存機能（回帰） ----------
    with ck.step("今日画面"):
        ck.check("今日画面に予定が出る", "架空の会議" in b.js("document.body.innerText"))
        ck.check("タブが4つある", b.js("document.querySelectorAll('.tab').length") == 4)

    # ---------- 修正3: タスクの表示 ----------
    with ck.step("タスク表示"):
        titles = b.js(f"({SECTION_TITLES})('タスク')")
        ck.check("今後のタスク（3日後・30日後）も表示される",
                 titles is not None and "3日後のタスク" in titles and "30日後のタスク" in titles, titles)
        ck.check("期限切れ・今日のタスクも表示される",
                 titles is not None and "期限切れタスク" in titles and "今日のタスク" in titles, titles)
        ck.check("期限の近い順に並ぶ",
                 titles == ["期限切れタスク", "今日のタスク", "3日後のタスク", "30日後のタスク"], titles)
        ck.check("昨日完了したタスクは出ない", "昨日完了したタスク" not in b.js("document.body.innerText"))
        ck.check("期限なしタスクは別のまとまりに出る",
                 b.js(f"({SECTION_TITLES})('期限なしのタスク')") == ["期限なしタスク"])
        b.screenshot(os.path.join(OUT, "today.png"), full=True)

    with ck.step("タスク完了"):
        b.js("[...document.querySelectorAll('.row')].find(r => r.textContent.includes('3日後のタスク')).querySelector('.check').setAttribute('data-test','c3')")
        b.tap_el("[data-test=c3]")
        done = b.js(f"JSON.parse(localStorage.getItem('{KEY}')).items.find(i => i.id === 't3').done")
        ck.check("チェックで完了になり保存される", done is True)

    # ---------- 修正1: 祝日 ----------
    with ck.step("祝日の計算"):
        for y, days in HOLIDAYS.items():
            got = b.js(f"import('./js/core/holidays.js').then(m => m.holidaysInYear({y}).map(h => h[0].slice(5)))")
            ck.check(f"{y}年の祝日が正しい（振替休日・国民の休日を含む）", got == days, got)
        name = b.js("import('./js/core/holidays.js').then(m => [m.holidayName('2026-11-03'), m.holidayName('2026-09-22'), m.holidayName('2026-05-06'), m.holidayName('2026-11-04')])")
        ck.check("祝日名が取れる", name == ["文化の日", "国民の休日", "振替休日", None], name)

    with ck.step("カレンダーの祝日表示"):
        b.js("location.hash = '#/calendar'"); b.pump(0.4)
        diff = (today.year * 12 + today.month) - (2026 * 12 + 9)  # 2026年9月へ移動
        for _ in range(abs(diff)):
            b.tap_el("[aria-label='前の月']" if diff > 0 else "[aria-label='次の月']", settle=0.15)
        ck.check("2026年9月を表示", "2026年9月" in b.js("document.querySelector('.cal-head .month').textContent"))
        color = lambda label: b.js(f"(() => {{ const e = [...document.querySelectorAll('.day:not(.other)')].find(x => x.getAttribute('aria-label').startsWith('{label}')); return e ? getComputedStyle(e.querySelector('.num')).color : null }})()")
        red = "rgb(255, 105, 97)"
        ck.check("敬老の日(9/21 月)が赤", color("9月21日") == red, color("9月21日"))
        ck.check("国民の休日(9/22 火)が赤", color("9月22日") == red, color("9月22日"))
        ck.check("秋分の日(9/23 水)が赤", color("9月23日") == red, color("9月23日"))
        ck.check("平日(9/24 木)は赤くない", color("9月24日") not in (red, None), color("9月24日"))
        b.tap_el("[aria-label^='9月22日']")
        ck.check("選んだ日の見出しに祝日名が出る", "国民の休日" in b.js("document.querySelector('.section h2').textContent"))
        b.screenshot(os.path.join(OUT, "calendar-sep.png"), full=True)

    # ---------- 修正2: メモ作成時のスクロール ----------
    with ck.step("メモ作成シート"):
        b.js("location.hash = '#/memos'"); b.pump(0.4)
        b.tap_el("#fab", settle=0.7)
        ck.check("メモ作成シートが開く", b.exists("#sheet-root.open .sheet"))
        ck.check("背面ページが固定される", b.js("document.body.style.position") == "fixed")
        # キーボード表示を再現: 見える範囲が 844 → 508px に縮む
        b.js("__vv.height = 508; __vv.dispatchEvent(new Event('resize'))"); b.pump(0.5)
        r = b.js("(() => { const s = document.querySelector('.sheet').getBoundingClientRect(); const h = document.querySelector('.sheet-header').getBoundingClientRect(); return [s.top, s.bottom, h.top, h.bottom] })()")
        ck.check("キーボード表示時、シートがキーボードの上に収まる", r[1] <= 508 + 1, r)
        ck.check("キーボード表示時、キャンセル/追加が画面内に見える", r[2] >= 0 and r[3] <= 508, r)
        b.screenshot(os.path.join(OUT, "memo-keyboard.png"))
        # iPhone が画面を上へずらした状態（見える範囲が 250px 下から始まる）
        b.js("__vv.offsetTop = 250; __vv.dispatchEvent(new Event('scroll'))"); b.pump(0.3)
        r2 = b.js("(() => { const s = document.querySelector('.sheet').getBoundingClientRect(); return [s.top, s.bottom] })()")
        ck.check("画面がずれても、シートが見えている範囲に収まる", r2[0] >= 250 - 1 and r2[1] <= 250 + 508 + 1, r2)
        b.js("__vv.offsetTop = 0; __vv.height = 844; __vv.dispatchEvent(new Event('resize'))"); b.pump(0.2)

    with ck.step("メモ保存"):
        b.type_text("#f-title", "テストで作ったメモ")
        b.type_text("#f-body", "1行目\n2行目")
        b.tap_el(".sheet-header .link-btn.strong", settle=0.7)
        ck.check("保存するとシートが閉じる", not b.exists("#sheet-root.open"))
        ck.check("背面ページの固定が解除される", b.js("document.body.style.position") == "")
        ck.check("メモ一覧に追加される", "テストで作ったメモ" in b.js("document.body.innerText"))

    # ---------- 予定の追加（回帰） ----------
    with ck.step("予定の追加"):
        b.js("location.hash = '#/today'"); b.pump(0.4)
        b.tap_el("#fab", settle=0.7)
        b.type_text("#f-title", "テストで追加した予定")
        b.tap_el(".sheet-header .link-btn.strong", settle=0.7)
        ck.check("予定を追加すると今日画面に出る", "テストで追加した予定" in b.js("document.body.innerText"))

    with ck.step("再読み込み"):
        b.reload()
        text = b.js("document.body.innerText")
        ck.check("再読み込み後も予定が残る", "テストで追加した予定" in text)
        b.js("location.hash = '#/memos'"); b.pump(0.4)
        ck.check("再読み込み後もメモが残る", "テストで作ったメモ" in b.js("document.body.innerText"))
        b.js("location.hash = '#/settings'"); b.pump(0.4)
        ck.check("設定画面が表示される", "バックアップを書き出す" in b.js("document.body.innerText"))

    ck.check("JSエラーなし", not b.errors, b.errors)

sys.exit(ck.summary())
