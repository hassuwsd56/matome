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


SEED = {"matome:mode": "local", KEY: {"version": 1, "meta": {"lastBackupAt": None}, "items": [
    item("e1", "event", title="架空の会議", date=d(0), allDay=False, startTime="10:00", endTime="11:00", note=""),
    item("t1", "task", title="期限切れタスク", due=d(-2), done=False, note=""),
    item("t2", "task", title="今日のタスク", due=d(0), done=False, note=""),
    item("t3", "task", title="3日後のタスク", due=d(3), done=False, note=""),
    item("t4", "task", title="30日後のタスク", due=d(30), done=False, note=""),
    item("t5", "task", title="昨日完了したタスク", due=d(1), done=True, doneAt=YESTERDAY, note=""),
    item("t6", "task", title="期限なしタスク", due="", done=False, note=""),
    item("m1", "memo", title="架空のメモ", body="本文の1行目"),
    # v0.3: 複数日の予定・旧形式（終了日なし）の予定・1日に多数の予定・メモ複数
    item("e2", "event", title="今日をまたぐ予定", date=d(-1), endDate=d(1), allDay=True, startTime="", endTime="", note=""),
    item("e3", "event", title="週末の旅行", date="2026-11-28", endDate="2026-11-30", allDay=False, startTime="09:00", endTime="18:00", note=""),
    item("e4", "event", title="旧形式の予定", date="2026-11-12", allDay=False, startTime="10:00", endTime="", note=""),
    *[item(f"x{i}", "event", title=f"多い予定{i}", date="2026-11-10", endDate="2026-11-10", allDay=False, startTime=f"{8 + i:02d}:00", endTime="", note="") for i in range(9)],
    item("m2", "memo", title="新しいメモ", body="b", updatedAt=f"{d(0)}T10:00:00.000Z"),
    item("m3", "memo", title="古いメモ", body="c", updatedAt=f"{d(-5)}T09:00:00.000Z"),
    item("m4", "memo", title="一番古いメモ", body="d", updatedAt=f"{d(-9)}T09:00:00.000Z"),
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
        ck.check("タブが3つ（今日・カレンダー・設定）で、メモのタブはない",
                 b.js("[...document.querySelectorAll('.tab')].map(t => t.textContent)") == ["今日", "カレンダー", "設定"],
                 b.js("[...document.querySelectorAll('.tab')].map(t => t.textContent)"))

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
        ck.check("祝日名が帯で出る", "国民の休日" in b.js("[...document.querySelectorAll('.holiday-bar')].map(e => e.textContent).join()"))
        b.screenshot(os.path.join(OUT, "calendar-sep.png"))
        b.tap_el("[aria-label^='9月22日']", settle=0.7)
        ck.check("日付をタップするとその日の一覧が開き、祝日名が出る", "国民の休日" in (b.js("document.querySelector('.day-sheet .day-holiday')?.textContent") or ""))
        b.tap_el(".day-sheet .sheet-header .link-btn", settle=0.5)
        ck.check("「閉じる」で一覧が閉じる", not b.exists("#sheet-root.open"))

    # ---------- v0.3: カレンダーに予定のタイトル ----------
    BARS = "(() => [...document.querySelectorAll('.bar')].map(e => ({t: e.textContent, c: e.style.gridColumn, cls: e.className})))()"
    DAY = "(label) => [...document.querySelectorAll('.day')].find(x => x.getAttribute('aria-label').startsWith(label) && !x.classList.contains('other'))"
    with ck.step("カレンダーにタイトル表示"):
        for _ in range(2):
            b.tap_el("[aria-label='次の月']", settle=0.15)  # 9月 → 11月
        ck.check("2026年11月を表示", "2026年11月" in b.js("document.querySelector('.cal-head .month').textContent"))
        bars = b.js(BARS)
        titles = [x["t"] for x in bars]
        ck.check("予定のタイトルがマスに出る", "旧形式の予定" in titles and "多い予定0" in titles, titles)
        ck.check("祝日（文化の日・勤労感謝の日）も帯で出る", "文化の日" in titles and "勤労感謝の日" in titles, titles)
        trip = [x for x in bars if x["t"] == "週末の旅行"]
        ck.check("週をまたぐ複数日の予定は、週ごとの帯 2 本になる", len(trip) == 2, trip)
        if len(trip) == 2:
            ck.check("1 本目は土曜の 1 マス（右につながる）", trip[0]["c"].replace(" ", "") == "7/8" and "cont-r" in trip[0]["cls"], trip[0])
            ck.check("2 本目は日曜〜月曜の 2 マス（左につながる）", trip[1]["c"].replace(" ", "") == "1/3" and "cont-l" in trip[1]["cls"], trip[1])
        more = b.js(f"({DAY})('11月10日').querySelector('.more')?.textContent")
        ck.check("入りきらない予定は「+N」で数を出す", bool(more) and more.startswith("+"), more)
        shown = sum(1 for t in titles if t.startswith("多い予定"))
        ck.check("帯の数＋「+N」の N が予定の数（9）と合う", bool(more) and shown + int(more[1:]) == 9, (shown, more))
        r = b.js("(() => { const w = [...document.querySelectorAll('.week')].pop().getBoundingClientRect(); const t = document.getElementById('tabbar').getBoundingClientRect(); return [w.bottom, t.top, document.documentElement.scrollHeight, innerHeight] })()")
        ck.check("カレンダーが 1 画面に収まる（タブバーの上まで）", r[0] <= r[1] + 1 and r[2] <= r[3] + 1, r)
        ck.check("上の見出しは隠れる（画面いっぱい）", b.js("getComputedStyle(document.querySelector('.app-header')).display") == "none")
        b.screenshot(os.path.join(OUT, "calendar-nov.png"))

    with ck.step("カレンダーの指の動き"):
        MONTH = "document.querySelector('.cal-head .month').textContent"
        b.swipe(200, 600, 200, 250, settle=0.6)
        ck.check("上下になぞっても画面は動かない", b.js("document.scrollingElement.scrollTop") == 0 and b.js(MONTH) == "2026年11月",
                 (b.js("document.scrollingElement.scrollTop"), b.js(MONTH)))
        b.swipe(340, 600, 60, 600, steps=20, settle=0.1)
        ck.check("左になぞると、すぐには切り替わらず横にすべって動く", b.js(MONTH) == "2026年11月"
                 and "350ms" in (b.js("document.querySelector('.cal-weeks').style.transition") or ""))
        b.pump(1.0)
        ck.check("すべり終わると次の月になる", b.js(MONTH) == "2026年12月", b.js(MONTH))
        b.swipe(100, 600, 150, 600, steps=10, settle=0.8)
        ck.check("少しだけ動かした時は月が変わらない", b.js(MONTH) == "2026年12月", b.js(MONTH))
        b.swipe(60, 600, 340, 600, steps=20, settle=1.2)
        ck.check("右になぞると前の月に戻る", b.js(MONTH) == "2026年11月", b.js(MONTH))

    with ck.step("その日の一覧から編集・追加"):
        b.tap_el("[aria-label^='11月12日']", settle=0.7)
        ck.check("一覧にその日の予定が出る", "旧形式の予定" in b.js("document.querySelector('.day-sheet').innerText"))
        b.js("[...document.querySelectorAll('.day-sheet .row')].find(r => r.textContent.includes('旧形式の予定')).setAttribute('data-test','old')")
        b.tap_el("[data-test=old]", settle=0.7)
        ck.check("行をタップすると編集シートが開く", b.js("document.querySelector('.sheet-title')?.textContent") == "予定")
        ck.check("旧形式の予定は終了日に開始日が入る", b.js("document.getElementById('f-endDate').value") == "2026-11-12")
        b.tap_el(".sheet-header .link-btn", settle=0.6)  # キャンセル
        b.tap_el("[aria-label^='11月18日']", settle=0.7)
        b.tap_el(".day-sheet .sheet-header .link-btn.strong", settle=0.7)  # ＋ 追加
        ck.check("「＋ 追加」で新規作成が開き、その日が入る",
                 b.js("document.querySelector('.sheet-title')?.textContent") == "新規作成" and b.js("document.getElementById('f-date').value") == "2026-11-18")

    # ---------- v0.3: 複数日の予定 ----------
    def set_val(sel, v):
        b.js(f"(() => {{ const e = document.querySelector('{sel}'); e.value = '{v}'; e.dispatchEvent(new Event('input', {{bubbles:true}})); e.dispatchEvent(new Event('change', {{bubbles:true}})); }})()")

    with ck.step("複数日の予定を登録"):
        ck.check("開始・終了それぞれに日付と時刻の欄がある",
                 all(b.exists(f"#f-{k}") for k in ("date", "startTime", "endDate", "endTime")))
        b.type_text("#f-title", "テストの出張")
        set_val("#f-date", "2026-11-19")
        ck.check("開始日を動かすと終了日も同じだけ動く", b.js("document.getElementById('f-endDate').value") == "2026-11-19")
        set_val("#f-startTime", "15:00")
        ck.check("開始時刻を入れると終了時刻が 1 時間後に入る", b.js("document.getElementById('f-endTime').value") == "16:00")
        set_val("#f-endDate", "2026-11-18")
        b.tap_el(".sheet-header .link-btn.strong", settle=0.4)
        ck.check("終了日が開始日より前だと保存できない", b.exists("#sheet-root.open") and "終了日は開始日以降" in (b.js("document.getElementById('toast').textContent") or ""))
        set_val("#f-endDate", "2026-11-21")
        set_val("#f-endTime", "12:00")
        b.tap_el(".sheet-header .link-btn.strong", settle=0.7)
        ev = b.js(f"JSON.parse(localStorage.getItem('{KEY}')).items.find(i => i.title === 'テストの出張')")
        ck.check("開始・終了の日付と時刻が保存される",
                 bool(ev) and [ev["date"], ev["startTime"], ev["endDate"], ev["endTime"]] == ["2026-11-19", "15:00", "2026-11-21", "12:00"], ev)
        trip = [x for x in b.js(BARS) if x["t"] == "テストの出張"]
        ck.check("カレンダーに木〜土の 3 マスの帯で出る", len(trip) == 1 and trip[0]["c"].replace(" ", "") == "5/8", trip)
        b.tap_el("[aria-label^='11月20日']", settle=0.7)
        txt = b.js("document.querySelector('.day-sheet').innerText")
        ck.check("途中の日の一覧にも出て、期間が表示される", "テストの出張" in txt and "11月19日 15:00 〜 11月21日 12:00" in txt, txt)
        b.tap_el(".day-sheet .sheet-header .link-btn", settle=0.5)

    with ck.step("今日画面（複数日・メモ）"):
        b.js("location.hash = '#/today'"); b.pump(0.4)
        ck.check("今日をまたぐ複数日の予定が今日画面に出る", "今日をまたぐ予定" in (b.js(f"({SECTION_TITLES})('予定')") or []))
        memos = b.js(f"({SECTION_TITLES})('メモ')")
        ck.check("今日画面にメモが新しい順に 3 件出る", memos == ["新しいメモ", "架空のメモ", "古いメモ"], memos)
        ck.check("「すべて見る」に件数が出る", "メモをすべて見る（4件）" in b.js("document.body.innerText"))
        b.screenshot(os.path.join(OUT, "today-memos.png"), full=True)
        b.tap_el(".more-row", settle=0.5)
        ck.check("「すべて見る」でメモ画面へ移る", b.js("location.hash") == "#/memos")
        b.tap_el(".back-btn", settle=0.5)
        ck.check("メモ画面の「‹ 今日」で今日画面に戻る", b.js("location.hash") == "#/today")
        b.js("location.hash = '#/memos'"); b.pump(0.4)

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
        t2 = b.js("(() => { const t = document.getElementById('f-body').getBoundingClientRect(); return [t.top, t.bottom] })()")
        ck.check("画面がずれても、本文欄が見えている範囲（キーボードの上）に収まる", t2[0] >= 250 - 1 and t2[1] <= 250 + 508 + 1, t2)
        b.js("__vv.offsetTop = 0; __vv.dispatchEvent(new Event('scroll'))"); b.pump(0.3)
        # v0.3: 本文を入力しても画面が動かないこと（本文欄がキーボードの上に収まり、欄の中でスクロールする）
        TA = "(() => { const t = document.getElementById('f-body').getBoundingClientRect(); const sb = document.querySelector('.sheet-body'); return [t.top, t.bottom, sb.scrollHeight - sb.clientHeight] })()"
        before = b.js(TA)
        ck.check("キーボード表示時、本文欄がキーボードの上に収まる", before[1] <= 508 + 1, before)
        ck.check("シート自体はスクロールしない（本文欄がシートに収まる）", before[2] <= 1, before)
        b.js("(() => { const t = document.getElementById('f-body'); t.focus(); t.value = Array.from({length: 40}, (_, i) => '行' + (i + 1)).join(String.fromCharCode(10)); t.dispatchEvent(new Event('input', {bubbles:true})); t.selectionStart = t.selectionEnd = t.value.length; })()"); b.pump(0.3)
        after = b.js(TA)
        ck.check("長い本文を入れても本文欄の位置・大きさが変わらない", abs(after[0] - before[0]) <= 1 and abs(after[1] - before[1]) <= 1, (before, after))
        ck.check("長い本文は本文欄の中でスクロールする", b.js("(() => { const t = document.getElementById('f-body'); return t.scrollHeight > t.clientHeight })()"))
        ck.check("長い本文でもシートはスクロールしない", after[2] <= 1, after)
        b.screenshot(os.path.join(OUT, "memo-long.png"))
        b.js("document.getElementById('f-body').value = ''; document.getElementById('f-body').dispatchEvent(new Event('input', {bubbles:true}))")
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

    with ck.step("メモが3件以下"):
        b.js(f"(() => {{ const d = JSON.parse(localStorage.getItem('{KEY}')); let n = 0; d.items = d.items.filter(i => i.type !== 'memo' || n++ < 3); localStorage.setItem('{KEY}', JSON.stringify(d)); }})()")
        b.js("location.hash = '#/today'"); b.reload()
        ck.check("メモが3件以下なら「すべて見る」は出ない",
                 len(b.js(f"({SECTION_TITLES})('メモ')") or []) == 3 and not b.exists(".more-row"))

    # ---------- v0.6: 予定の色 ----------
    with ck.step("予定の色"):
        b.tap_el("#fab", settle=0.7)
        b.type_text("#f-title", "色つきの予定")
        ck.check("色の欄がある（最初は自動）", b.exists("#f-color .color-dot.auto.on"))
        b.tap_el("#f-color [data-color='#ff375f']", settle=0.2)
        b.tap_el(".sheet-header .link-btn.strong", settle=0.7)
        ev = b.js(f"JSON.parse(localStorage.getItem('{KEY}')).items.find(i => i.title === '色つきの予定')")
        ck.check("選んだ色が保存される", bool(ev) and ev.get("color") == "#ff375f", ev)
        dot = b.js("getComputedStyle([...document.querySelectorAll('.row')].find(r => r.textContent.includes('色つきの予定')).querySelector('.type-dot')).backgroundColor")
        ck.check("一覧の印が選んだ色になる", dot == "rgb(255, 55, 95)", dot)
        b.js("location.hash = '#/calendar'"); b.pump(0.3)
        b.tap_el(".pill-btn", settle=0.6)  # 今日の月へ
        bar = b.js("(() => { const e = [...document.querySelectorAll('.bar')].find(x => x.textContent === '色つきの予定'); return e ? getComputedStyle(e).backgroundColor : null })()")
        ck.check("カレンダーの帯が選んだ色になる", bar == "rgb(255, 55, 95)", bar)

    ck.check("JSエラーなし", not b.errors, b.errors)

sys.exit(ck.summary())
