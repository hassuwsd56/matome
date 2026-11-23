"""まとめ帳 クラウド保存・同期・共有カレンダーのテスト（本物の Firebase プロジェクトを使う）

架空のテスト用アカウントを作って動かし、最後にアカウントとデータを消す。
実行: "/c/Users/skyio/anaconda3/python.exe" tests/test_cloud.py
"""
import json, os, random, string, sys, time, urllib.request, urllib.error
from datetime import date

sys.path.insert(0, os.path.expanduser("~/.claude/skills/webapp-test/scripts"))
from cdp import Browser, Checker, serve

APP_DIR = os.environ.get("APP_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(os.environ.get("TEMP", "."), "webapp-test-shots", "matome-cloud")
API_KEY = "AIzaSyB6uQsTglvpd5fK5T7AsmuJvidDSsmUbew"
PROJECT = "matome-3b4f2"
FS = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
RUN = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
PASS = "test-pass-" + RUN
TODAY = date.today().isoformat()


def email(who): return f"matome-test-{who}-{RUN}@example.com"


# ---------- Firebase に直接つなぐ道具（ルールの確認・後片付け用） ----------
def http(method, url, body=None, token=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def sign_in(mail):
    st, d = http("POST", f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
                 {"email": mail, "password": PASS, "returnSecureToken": True})
    return (d["idToken"], d["localId"]) if st == 200 else (None, None)


def sign_up(mail):
    st, d = http("POST", f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
                 {"email": mail, "password": PASS, "returnSecureToken": True})
    return d["idToken"], d["localId"]


def join_rest(token, uid, cid, invite, role):
    """招待リンクでの参加を、アプリを通さずに直接試す（ルールの確認用）"""
    q = lambda k: f"{k}.`{uid}`"
    body = {"writes": [{
        "update": {"name": f"projects/{PROJECT}/databases/(default)/documents/calendars/{cid}",
                   "fields": {"roles": {"mapValue": {"fields": {uid: {"stringValue": role}}}},
                              "names": {"mapValue": {"fields": {uid: {"stringValue": "直接参加"}}}},
                              "lastJoin": {"stringValue": invite}}},
        "updateMask": {"fieldPaths": [q("roles"), q("names"), "lastJoin"]},
        "updateTransforms": [{"fieldPath": "memberIds", "appendMissingElements": {"values": [{"stringValue": uid}]}}],
        "currentDocument": {"exists": True},
    }]}
    return http("POST", f"{FS}:commit", body, token)[0]


def put_event(token, cid, eid, title):
    return http("PATCH", f"{FS}/calendars/{cid}/events/{eid}", {"fields": {
        "type": {"stringValue": "event"}, "title": {"stringValue": title}, "date": {"stringValue": TODAY}}}, token)[0]


def cleanup_account(mail):
    token, uid = sign_in(mail)
    if not token: return
    st, d = http("GET", f"{FS}/calendars/my-{uid}/events?pageSize=300", token=token)
    for doc in d.get("documents", []):
        http("DELETE", f"https://firestore.googleapis.com/v1/{doc['name']}", token=token)
    http("DELETE", f"{FS}/calendars/my-{uid}", token=token)
    st, d = http("GET", f"{FS}/users/{uid}/items?pageSize=300", token=token)
    for doc in d.get("documents", []):
        http("DELETE", f"https://firestore.googleapis.com/v1/{doc['name']}", token=token)
    http("DELETE", f"{FS}/users/{uid}", token=token)
    http("POST", f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={API_KEY}", {"idToken": token})


# ---------- ブラウザ操作 ----------
def wait_for(b, js, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if b.js(js): return True
        except Exception:
            pass
        b.pump(0.3)
    return False


def text(b): return b.js("document.body.innerText")


def signup(b, name, mail):
    assert wait_for(b, "!!document.getElementById('auth-email')"), "ログイン画面が出ない"
    b.tap_el(".auth .segmented .seg:nth-child(2)", settle=0.3)
    b.type_text("#auth-name", name)
    b.type_text("#auth-email", mail)
    b.type_text("#auth-pass", PASS)
    b.tap_el("#auth-submit", settle=0.5)


def login(b, mail):
    assert wait_for(b, "!!document.getElementById('auth-email')"), "ログイン画面が出ない"
    b.type_text("#auth-email", mail)
    b.type_text("#auth-pass", PASS)
    b.tap_el("#auth-submit", settle=0.5)


def logged_in(b): return wait_for(b, "!!document.querySelector('.tab') && !document.body.classList.contains('auth-mode')", 25)


def tap(b, sel, settle=0.5):
    """シートの中でスクロールが必要な所にあるボタンも、画面内に出してから押す"""
    b.js(f"document.querySelector(\"{sel}\").scrollIntoView({{block: 'center'}})"); b.pump(0.3)
    b.tap_el(sel, settle=settle)


def add_event(b, title, calendar_label=None):
    b.js("location.hash = '#/today'"); b.pump(0.4)
    b.tap_el("#fab", settle=0.7)
    b.type_text("#f-title", title)
    if calendar_label:
        b.js(f"(() => {{ const s = document.getElementById('f-calendarId'); s.value = [...s.options].find(o => o.textContent === '{calendar_label}').value; s.dispatchEvent(new Event('change', {{bubbles:true}})); }})()")
    b.tap_el(".sheet-header .link-btn.strong", settle=0.7)


ck = Checker()
base = serve(APP_DIR)
LOCAL_SEED = {"matome:data": {"version": 1, "meta": {"lastBackupAt": None}, "items": [
    {"id": f"local-{RUN}", "type": "event", "title": "ログイン前の予定", "date": TODAY, "endDate": TODAY, "allDay": True,
     "startTime": "", "endTime": "", "note": "", "createdAt": f"{TODAY}T00:00:00.000Z", "updatedAt": f"{TODAY}T00:00:00.000Z"}]}}

A, B, C, D = email("a"), email("b"), email("c"), email("d")
browsers = []
try:
    a1 = Browser(); browsers.append(a1)   # A さんの iPhone
    a2 = Browser(); browsers.append(a2)   # A さんの PC
    bb = Browser(); browsers.append(bb)   # B さん（編集できる）
    cc = Browser(); browsers.append(cc)   # C さん（見るだけ）

    with ck.step("登録とデータの移行"):
        a1.open(base + "index.html", seed=LOCAL_SEED)
        ck.check("ログインしていないとログイン画面が出る", wait_for(a1, "!!document.getElementById('auth-email')"))
        a1.screenshot(os.path.join(OUT, "login.png"))
        signup(a1, "テスト太郎", A)
        ck.check("登録するとアプリに入れる", logged_in(a1))
        ck.check("ログイン前のデータがクラウドに移る", wait_for(a1, "document.body.innerText.includes('ログイン前の予定')"))
        token_a, uid_a = sign_in(A)
        my_a = f"my-{uid_a}"
        ok = False
        for _ in range(30):
            if http("GET", f"{FS}/calendars/{my_a}/events/local-{RUN}", token=token_a)[0] == 200: ok = True; break
            time.sleep(0.5)
        ck.check("マイカレンダーが作られ、移したデータがそこに保存されている", ok)
        ck.check("どのカレンダーにも入っていない予定は残らない", http("GET", f"{FS}/users/{uid_a}/items/local-{RUN}", token=token_a)[0] == 404)

    with ck.step("iPhone と PC の同期"):
        add_event(a1, "iPhoneで追加した予定")
        a2.open(base + "index.html")
        login(a2, A)
        ck.check("PC でログインできる", logged_in(a2))
        ck.check("iPhone で追加した予定が PC に出る", wait_for(a2, "document.body.innerText.includes('iPhoneで追加した予定')"))
        add_event(a2, "PCで追加した予定")
        ck.check("PC で追加した予定が iPhone にすぐ出る", wait_for(a1, "document.body.innerText.includes('PCで追加した予定')"))
        a1.js("[...document.querySelectorAll('.row')].find(r => r.textContent.includes('PCで追加した予定')).setAttribute('data-test','pc')")
        a1.tap_el("[data-test=pc]", settle=0.7)
        a1.tap_el(".danger-btn", settle=0.2); a1.tap_el(".danger-btn", settle=0.7)
        ck.check("iPhone で消すと PC からも消える", wait_for(a2, "!document.body.innerText.includes('PCで追加した予定')"))
        ck.check("クラウド保存中はバックアップの注意を出さない", not a1.exists(".banner"))

    with ck.step("マイカレンダーの招待リンク"):
        a1.js("location.hash = '#/settings'"); a1.pump(0.6)
        tap(a1, f"[data-cal='{my_a}']", settle=1.2)
        ck.check("マイカレンダーの管理画面が開き、まだ自分だけ", wait_for(a1, "document.querySelector('.cal-sheet')?.innerText.includes('まだ自分だけ')"))
        ck.check("マイカレンダーは削除できない", not a1.exists(".cal-sheet .danger-btn"))
        tap(a1, "#invite-create", settle=1.0)
        url_my = a1.js("document.getElementById('invite-url')?.value")
        ck.check("マイカレンダーの招待リンクができる", bool(url_my) and my_a in url_my, url_my)
        a1.tap_el(".cal-sheet .sheet-header .link-btn", settle=0.5)

    with ck.step("共有カレンダーを作って招待"):
        a1.js("location.hash = '#/settings'"); a1.pump(0.5)
        a1.tap_el("#cal-create", settle=0.7)
        a1.type_text("#cal-name", "テスト共有")
        a1.tap_el(".sheet-header .link-btn.strong", settle=1.0)
        ck.check("共有カレンダーを作ると管理画面が開く", wait_for(a1, "!!document.querySelector('.cal-sheet')"))
        a1.pump(0.8)  # シートが上がりきるのを待つ
        tap(a1, "#invite-create", settle=1.0)   # 編集できる
        url_edit = a1.js("document.getElementById('invite-url')?.value")
        ck.check("招待リンク（編集できる）ができる", bool(url_edit) and "/editor/" in url_edit, url_edit)
        tap(a1, ".invite-role [data-role=viewer]", settle=0.2)
        tap(a1, "#invite-create", settle=1.0)   # 見るだけ
        url_view = a1.js("document.getElementById('invite-url')?.value")
        ck.check("招待リンク（見るだけ）ができる", bool(url_view) and "/viewer/" in url_view, url_view)
        a1.screenshot(os.path.join(OUT, "calendar-sheet.png"))
        cid = url_edit.split("#/join/")[1].split("/")[0]
        tok_edit = url_edit.split("#/join/")[1].split("/")[1]
        tok_view = url_view.split("#/join/")[1].split("/")[1]
        a1.tap_el(".cal-sheet .sheet-header .link-btn", settle=0.5)

    local = lambda u: base + "index.html#" + u.split("#", 1)[1]

    with ck.step("招待リンクで参加（編集できる）"):
        bb.open(local(url_edit))
        ck.check("未登録で招待リンクを開くと案内が出る", wait_for(bb, "document.body.innerText.includes('共有カレンダーに招待されています')"))
        signup(bb, "テスト花子", B)
        ck.check("登録すると参加の確認が出る", wait_for(bb, "!!document.getElementById('join-ok')", 25))
        ck.check("確認にカレンダー名と権限が出る", "テスト共有" in text(bb) and "編集できる" in text(bb))
        bb.tap_el("#join-ok", settle=1.0)
        ck.check("参加できる", wait_for(bb, "document.body.innerText.includes('参加しました') || location.hash === '#/calendar'"))
        add_event(bb, "花子が共有に入れた予定", "テスト共有")
        ck.check("参加した人が共有カレンダーに入れた予定が、オーナーに出る", wait_for(a1, "location.hash = '#/today'; document.body.innerText.includes('花子が共有に入れた予定')"))
        ck.check("一覧にカレンダー名が出る", "テスト共有" in a1.js("[...document.querySelectorAll('.row')].find(r => r.textContent.includes('花子が共有に入れた予定'))?.innerText || ''"))
        ck.check("テスト共有だけに参加した段階では、マイカレンダーの予定は見えない", "ログイン前の予定" not in text(bb))
        # 今回の指摘: マイカレンダーに招待されると、招待前からあった予定も見える
        bb.js(f"location.href = '{local(url_my)}'"); bb.pump(1.0)
        ck.check("マイカレンダーの招待で参加の確認が出る", wait_for(bb, "!!document.getElementById('join-ok')", 15))
        bb.tap_el("#join-ok", settle=1.0)
        ck.check("招待前からあった予定（ログイン前の予定・iPhoneで追加した予定）が見える",
                 wait_for(bb, "location.hash = '#/today'; document.body.innerText.includes('ログイン前の予定') && document.body.innerText.includes('iPhoneで追加した予定')"))
        add_event(a1, "太郎のマイカレンダーの予定")

    with ck.step("招待リンクで参加（見るだけ）"):
        cc.open(local(url_view))
        signup(cc, "テスト次郎", C)
        ck.check("見るだけのリンクで参加の確認が出る", wait_for(cc, "!!document.getElementById('join-ok')", 25) and "見るだけ" in text(cc))
        cc.tap_el("#join-ok", settle=1.0)
        ck.check("共有の予定が見える", wait_for(cc, "location.hash = '#/today'; document.body.innerText.includes('花子が共有に入れた予定')"))
        ck.check("招待されていないカレンダー（太郎のマイカレンダー）の予定は見えない",
                 "太郎のマイカレンダーの予定" not in text(cc) and "iPhoneで追加した予定" not in text(cc))
        cc.js("[...document.querySelectorAll('.row')].find(r => r.textContent.includes('花子が共有に入れた予定')).setAttribute('data-test','ev')")
        cc.tap_el("[data-test=ev]", settle=0.7)
        ck.check("見るだけの予定は「見るだけ」で開き、保存・削除がない",
                 "見るだけ" in cc.js("document.querySelector('.sheet-title').textContent") and not cc.exists(".danger-btn")
                 and cc.js("document.getElementById('f-title').disabled"))
        cc.screenshot(os.path.join(OUT, "viewer.png"))
        cc.tap_el(".sheet-header .link-btn", settle=0.5)
        cc.tap_el("#fab", settle=0.7)
        opts = cc.js("[...(document.getElementById('f-calendarId')?.options || [])].map(o => o.textContent)")
        ck.check("見るだけのカレンダーは、予定の追加先に出ない", "テスト共有" not in (opts or []), opts)
        cc.tap_el(".sheet-header .link-btn", settle=0.5)

    with ck.step("カレンダーの切り替え"):
        a1.js("location.hash = '#/calendar'"); a1.pump(0.8)
        chips = a1.js("[...document.querySelectorAll('.cal-chips .chip')].map(e => e.textContent)")
        ck.check("「すべて」「マイカレンダー」「テスト共有」「＋ 作成」が並ぶ", chips == ["すべて", "マイカレンダー", "テスト共有", "＋ 作成"], chips)
        BARS = "[...document.querySelectorAll('.bar')].map(e => e.textContent)"
        a1.tap_el(f".chip[data-filter='{cid}']", settle=0.6)
        bars = a1.js(BARS)
        ck.check("「テスト共有」を選ぶと、その予定だけ出る", "花子が共有に入れた予定" in bars and "太郎のマイカレンダーの予定" not in bars, bars)
        ck.check("選んだカレンダーの共有状況が出る", "人で共有中" in a1.js("document.querySelector('.cal-info').innerText"))
        a1.tap_el("#fab", settle=0.7)
        ck.check("選んでいるカレンダーが、新しい予定の入れ先になる", a1.js("document.getElementById('f-calendarId').value") == cid)
        a1.tap_el(".sheet-header .link-btn", settle=0.5)
        a1.screenshot(os.path.join(OUT, "calendar-filter.png"))
        a1.tap_el(".chip[data-filter='all']", settle=0.6)
        bars = a1.js(BARS)
        ck.check("「すべて」で全部のカレンダーの予定が出る", "花子が共有に入れた予定" in bars and "太郎のマイカレンダーの予定" in bars, bars)
        a1.tap_el("#fab", settle=0.7)
        ck.check("「すべて」の時の新しい予定の入れ先はマイカレンダー", a1.js("document.getElementById('f-calendarId').value") == my_a)
        a1.tap_el(".sheet-header .link-btn", settle=0.5)

    with ck.step("サーバー側のルール"):
        token_c, uid_c = sign_in(C)
        token_b, uid_b = sign_in(B)
        ck.check("見るだけの人は、共有の予定を書き込めない", put_event(token_c, cid, "x-" + RUN, "不正") == 403)
        ck.check("編集できる人は書き込める", put_event(token_b, cid, "ok-" + RUN, "正しい書き込み") == 200)
        ck.check("他人の自分だけのデータは読めない", http("GET", f"{FS}/users/{uid_a}/items/local-{RUN}", token=token_c)[0] == 403)
        token_d, uid_d = sign_up(D)
        ck.check("メンバーでない人は共有カレンダーを読めない", http("GET", f"{FS}/calendars/{cid}", token=token_d)[0] == 403)
        ck.check("見るだけの招待で「編集できる」として参加はできない", join_rest(token_d, uid_d, cid, tok_view, "editor") == 403)
        ck.check("でたらめな招待では参加できない", join_rest(token_d, uid_d, cid, "wrong" + RUN, "viewer") == 403)
        ck.check("正しい招待なら参加できる", join_rest(token_d, uid_d, cid, tok_view, "viewer") == 200)
        st, cal = http("GET", f"{FS}/calendars/{cid}", token=token_b)
        ck.check("メンバーは自分の権限を変えられない",
                 http("PATCH", f"{FS}/calendars/{cid}?updateMask.fieldPaths=roles.`{uid_b}`",
                      {"fields": {"roles": {"mapValue": {"fields": {uid_b: {"stringValue": "owner"}}}}}}, token_b)[0] == 403)
        ck.check("ログインしていないと何も読めない", http("GET", f"{FS}/calendars/{cid}")[0] in (401, 403))

    with ck.step("権限の変更・退出・削除"):
        a1.js("location.hash = '#/settings'"); a1.pump(0.6)
        a1.tap_el(f"[data-cal='{cid}']", settle=1.2)
        ck.check("メンバー一覧に参加者が出る", wait_for(a1, "document.querySelector('.cal-sheet').innerText.includes('テスト次郎')"))
        a1.js(f"(() => {{ const s = document.querySelector('.member[data-uid=\"{uid_c}\"] select'); s.value = 'editor'; s.dispatchEvent(new Event('change', {{bubbles:true}})); }})()")
        time.sleep(2)
        ck.check("オーナーが「編集できる」に変えると、書き込めるようになる", put_event(token_c, cid, "c-" + RUN, "次郎の予定") == 200)
        a1.js(f"document.querySelector('.member[data-uid=\"{uid_d}\"] .danger-text').click()")
        time.sleep(2)
        ck.check("オーナーが外した人は読めなくなる", http("GET", f"{FS}/calendars/{cid}/events/ok-{RUN}", token=token_d)[0] == 403)
        a1.tap_el(".cal-sheet .sheet-header .link-btn", settle=0.5)
        bb.js("location.hash = '#/settings'"); bb.pump(0.6)
        bb.tap_el(f"[data-cal='{cid}']", settle=1.2)
        tap(bb, ".cal-sheet .danger-btn", settle=0.2); tap(bb, ".cal-sheet .danger-btn", settle=1.0)
        ck.check("参加者は自分で抜けられる", wait_for(bb, "location.hash = '#/today'; !document.body.innerText.includes('花子が共有に入れた予定')"))
        a1.tap_el(f"[data-cal='{cid}']", settle=1.2)
        tap(a1, ".cal-sheet .danger-btn", settle=0.2); tap(a1, ".cal-sheet .danger-btn", settle=1.5)
        ck.check("オーナーが削除すると、他のメンバーからも消える", wait_for(cc, "location.hash = '#/today'; !document.body.innerText.includes('花子が共有に入れた予定')"))
        time.sleep(2)
        ck.check("削除した共有カレンダーはクラウドからも消える", http("GET", f"{FS}/calendars/{cid}", token=token_a)[0] in (403, 404))

    with ck.step("ログアウト"):
        a2.js("location.hash = '#/settings'"); a2.pump(0.5)
        a2.tap_el("#logout", settle=1.5)
        ck.check("ログアウトするとログイン画面に戻る", wait_for(a2, "!!document.getElementById('auth-email')"))
        ck.check("ログアウト後、データは見えない", "iPhoneで追加した予定" not in text(a2))

    errs = [e for b in browsers for e in b.errors if "permission" not in e.lower() and "favicon" not in e]
    ck.check("JS エラーなし（権限エラーの確認分を除く）", not errs, errs[:5])
finally:
    for b in browsers:
        try: b.close()
        except Exception: pass
    # 途中で止まった時のため、共有カレンダーも消しておく
    try:
        ta, _ = sign_in(A)
        if ta and "cid" in dir():
            st, d = http("GET", f"{FS}/calendars/{cid}/events?pageSize=300", token=ta)
            for doc in d.get("documents", []):
                http("DELETE", f"https://firestore.googleapis.com/v1/{doc['name']}", token=ta)
            http("DELETE", f"{FS}/calendars/{cid}", token=ta)
    except Exception as e:
        print("cleanup calendar", e)
    for m in (A, B, C, D):
        try: cleanup_account(m)
        except Exception as e: print("cleanup", m, e)
    print("テスト用アカウントとデータを削除しました")

sys.exit(ck.summary())
