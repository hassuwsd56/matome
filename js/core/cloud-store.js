import { migrate } from './schema.js';
import { toast } from '../ui/toast.js';

const newId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');

export const ROLE_LABEL = { owner: 'オーナー', editor: '編集できる', viewer: '見るだけ' };
const INVITE_DAYS = 7;

// クラウド（Firebase）に保存する入れ物。Store（端末内保存）と同じ使い方ができる。
//   users/{uid}                    … 表示名・meta
//   users/{uid}/items/{id}         … 自分だけの予定・タスク・メモ
//   calendars/{cid}                … 共有カレンダー（メンバー・権限・招待）
//   calendars/{cid}/events/{id}    … 共有カレンダーの予定
// 書き込みは端末内にすぐ反映され（画面もすぐ変わる）、電波がつながった時にクラウドへ送られる。
export class CloudStore {
  constructor(fb, user) {
    this.fb = fb;
    this.user = user;
    this.uid = user.uid;
    this.isCloud = true;
    this.personal = new Map();
    this.cals = new Map(); // cid → カレンダー
    this.calEvents = new Map(); // cid → Map(id → 予定)
    this.calUnsubs = new Map();
    this.meta = { lastBackupAt: null };
    this.profile = {};
    this.listeners = new Set();
    this.unsubs = [];
  }

  get name() {
    return this.profile.name || this.user.displayName || (this.user.email || '').split('@')[0];
  }

  async init() {
    const { F, db } = this.fb;
    const userRef = F.doc(db, 'users', this.uid);
    let resolveFirst;
    const first = new Promise((r) => { resolveFirst = r; });
    let waiting = 2;
    const arrived = () => { if (--waiting === 0) resolveFirst(); };
    const once = (fn) => { let done = false; return () => { if (!done) { done = true; fn(); } }; };
    const a1 = once(arrived);
    const a2 = once(arrived);
    const fail = (where, cb) => (e) => { console.error(where, e); cb?.(); };

    this.unsubs.push(F.onSnapshot(userRef, (snap) => {
      const d = snap.data() || {};
      this.profile = d;
      this.meta = { lastBackupAt: null, ...(d.meta || {}) };
      this._emit();
    }, fail('users')));

    this.unsubs.push(F.onSnapshot(F.collection(userRef, 'items'), (snap) => {
      this.personal = new Map(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id }]));
      this._emit();
      a1();
    }, fail('items', a1)));

    const q = F.query(F.collection(db, 'calendars'), F.where('memberIds', 'array-contains', this.uid));
    // includeMetadataChanges: サーバーの最新と確認できたか（calsSynced）を知るため
    this.unsubs.push(F.onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      if (!snap.metadata.fromCache) this.calsSynced = true;
      const next = new Map(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id }]));
      for (const cid of this.cals.keys()) if (!next.has(cid)) this._stopCalendar(cid);
      this.cals = next;
      for (const cid of next.keys()) if (!this.calUnsubs.has(cid)) this._watchCalendar(cid);
      this._emit();
      a2();
    }, fail('calendars', a2)));

    // 初回の読み込みを待つ（電波がない時は端末内のデータですぐ返る。念のため最大 8 秒）
    await Promise.race([first, new Promise((r) => setTimeout(r, 8000))]);
    if (!this.profile.name && this.user.displayName) this._write(F.setDoc(userRef, { name: this.user.displayName }, { merge: true }));
  }

  _watchCalendar(cid) {
    const { F, db } = this.fb;
    const unsub = F.onSnapshot(F.collection(db, 'calendars', cid, 'events'), (snap) => {
      this.calEvents.set(cid, new Map(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id, calendarId: cid }])));
      this._emit();
    }, (e) => { console.warn('events', cid, e); this._stopCalendar(cid); this._emit(); });
    this.calUnsubs.set(cid, unsub);
  }

  _stopCalendar(cid) {
    this.calUnsubs.get(cid)?.();
    this.calUnsubs.delete(cid);
    this.calEvents.delete(cid);
  }

  dispose() {
    for (const u of this.unsubs) u();
    for (const cid of [...this.calUnsubs.keys()]) this._stopCalendar(cid);
    this.unsubs = [];
    this.listeners.clear();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    clearTimeout(this._emitTimer);
    // 複数の変更が続けて届いた時に、画面の描き直しを 1 回にまとめる
    this._emitTimer = setTimeout(() => { for (const fn of this.listeners) fn(); }, 0);
  }

  // 書き込みはクラウドの返事を待たない（電波がない時も止まらないように）。失敗だけ知らせる。
  _write(promise) {
    promise.catch((e) => {
      console.error(e);
      toast(e?.code === 'permission-denied' ? '権限がないため保存できませんでした' : '保存に失敗しました');
    });
    return promise;
  }

  // ---------- 予定・タスク・メモ ----------
  items(filter) {
    const all = [...this.personal.values()];
    for (const m of this.calEvents.values()) all.push(...m.values());
    return filter ? all.filter(filter) : all;
  }

  get(id) {
    return this.items((it) => it.id === id)[0] || null;
  }

  _ref(item) {
    const { F, db } = this.fb;
    return item.calendarId
      ? F.doc(db, 'calendars', item.calendarId, 'events', item.id)
      : F.doc(db, 'users', this.uid, 'items', item.id);
  }

  _data(item) {
    const { id, ...rest } = item;
    if (!rest.calendarId) delete rest.calendarId;
    return rest;
  }

  _applyLocal(item) {
    if (item.calendarId) {
      if (!this.calEvents.has(item.calendarId)) this.calEvents.set(item.calendarId, new Map());
      this.calEvents.get(item.calendarId).set(item.id, item);
    } else this.personal.set(item.id, item);
  }

  _removeLocal(item) {
    if (item.calendarId) this.calEvents.get(item.calendarId)?.delete(item.id);
    else this.personal.delete(item.id);
  }

  async add(type, fields) {
    const now = new Date().toISOString();
    const item = { ...fields, id: newId(), type, createdAt: now, updatedAt: now };
    if (type === 'event' && !item.calendarId) item.calendarId = this.defaultCalendarId();
    if (type !== 'event' || !item.calendarId) delete item.calendarId;
    if (item.calendarId) item.createdBy = this.uid;
    this._applyLocal(item);
    this._emit();
    this._write(this.fb.F.setDoc(this._ref(item), this._data(item)));
    return item;
  }

  async update(id, patch) {
    const prev = this.get(id);
    if (!prev) return null;
    const next = { ...prev, ...patch, id, type: prev.type, updatedAt: new Date().toISOString() };
    if (!next.calendarId) delete next.calendarId;
    const { F, db } = this.fb;
    this._removeLocal(prev);
    this._applyLocal(next);
    this._emit();
    if ((prev.calendarId || '') !== (next.calendarId || '')) {
      // 別のカレンダーへ移す: 元の場所から消して、新しい場所に作る
      const batch = F.writeBatch(db);
      batch.delete(this._ref(prev));
      batch.set(this._ref(next), this._data(next));
      this._write(batch.commit());
    } else {
      this._write(F.setDoc(this._ref(next), this._data(next)));
    }
    return next;
  }

  async remove(id) {
    const prev = this.get(id);
    if (!prev) return;
    this._removeLocal(prev);
    this._emit();
    this._write(this.fb.F.deleteDoc(this._ref(prev)));
  }

  getMeta(key) {
    return this.meta[key] ?? null;
  }

  async setMeta(key, value) {
    this.meta[key] = value;
    const { F, db } = this.fb;
    this._write(F.setDoc(F.doc(db, 'users', this.uid), { meta: { [key]: value } }, { merge: true }));
  }

  async setName(name) {
    const { F, db, A, auth } = this.fb;
    this.profile = { ...this.profile, name };
    this._write(F.setDoc(F.doc(db, 'users', this.uid), { name }, { merge: true }));
    A.updateProfile(auth.currentUser, { displayName: name }).catch(() => {});
    // 参加している共有カレンダーの表示名も変える
    for (const c of this.cals.values()) {
      this._write(F.updateDoc(F.doc(db, 'calendars', c.id), { [`names.${this.uid}`]: name }));
    }
    this._emit();
  }

  snapshot() {
    return JSON.parse(JSON.stringify({ version: 1, items: this.items(), meta: this.meta }));
  }

  // バックアップからの復元: 自分だけのデータを置き換える（共有カレンダーの予定は変えない）
  async replaceAll(data) {
    const d = migrate(data);
    const { F, db } = this.fb;
    const keep = d.items.filter((it) => !it.calendarId);
    const keepIds = new Set(keep.map((it) => it.id));
    const ops = [];
    for (const it of this.personal.values()) if (!keepIds.has(it.id)) ops.push((b) => b.delete(this._ref(it)));
    for (const it of keep) ops.push((b) => b.set(this._ref(it), this._data(it)));
    for (let i = 0; i < ops.length; i += 400) {
      const batch = F.writeBatch(db);
      ops.slice(i, i + 400).forEach((op) => op(batch));
      this._write(batch.commit());
    }
    this.personal = new Map(keep.map((it) => [it.id, it]));
    this._emit();
  }

  // 端末内（ログイン前）のデータをクラウドへ移す。同じ ID で書くので、2 回実行しても増えない。
  async importLocal(items) {
    const { F, db } = this.fb;
    const list = items.filter((it) => it && it.id && it.type);
    for (let i = 0; i < list.length; i += 400) {
      const batch = F.writeBatch(db);
      for (const it of list.slice(i, i + 400)) {
        const copy = { ...it };
        delete copy.calendarId;
        batch.set(this._ref(copy), this._data(copy));
        this.personal.set(copy.id, copy);
      }
      this._write(batch.commit());
    }
    this._emit();
    return list.length;
  }

  // ---------- 共有カレンダー ----------
  // マイカレンダーを先頭に、あとは作った順
  calendars() {
    const my = this.defaultCalId;
    return [...this.cals.values()].sort((a, b) =>
      (b.id === my) - (a.id === my) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  }

  // 自分の「マイカレンダー」の ID（端末が違っても同じになるよう、ユーザー ID から決める）
  get defaultCalId() {
    return `my-${this.uid}`;
  }

  defaultCalendarId() {
    return this.cals.has(this.defaultCalId) ? this.defaultCalId : '';
  }

  // マイカレンダーを用意し、どのカレンダーにも入っていない予定をそこへ移す。
  // サーバーと確認できない時（電波なし）は作らず、次に開いた時にやり直す（2 台で二重に作らないため）。
  async ensureDefaultCalendar() {
    const { F, db } = this.fb;
    const cid = this.defaultCalId;
    if (!this.cals.has(cid)) {
      const end = Date.now() + 8000;
      while (!this.calsSynced && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
      if (!this.calsSynced) return false;
      if (!this.cals.has(cid)) {
        const cal = {
          name: 'マイカレンダー', color: '#0a84ff', owner: this.uid, memberIds: [this.uid],
          roles: { [this.uid]: 'owner' }, names: { [this.uid]: this.name }, invites: {}, createdAt: new Date().toISOString(),
        };
        this.cals.set(cid, { ...cal, id: cid });
        this._watchCalendar(cid);
        this._write(F.setDoc(F.doc(db, 'calendars', cid), cal));
      }
    }
    const loose = [...this.personal.values()].filter((it) => it.type === 'event');
    for (let i = 0; i < loose.length; i += 200) {
      const batch = F.writeBatch(db);
      for (const it of loose.slice(i, i + 200)) {
        const moved = { ...it, calendarId: cid, createdBy: this.uid };
        batch.delete(this._ref(it));
        batch.set(this._ref(moved), this._data(moved));
        this.personal.delete(it.id);
        this._applyLocal(moved);
      }
      this._write(batch.commit());
    }
    this._emit();
    return true;
  }

  calendar(cid) {
    return this.cals.get(cid) || null;
  }

  roleIn(cid) {
    return this.cals.get(cid)?.roles?.[this.uid] || null;
  }

  canEdit(item) {
    if (!item?.calendarId) return true;
    return ['owner', 'editor'].includes(this.roleIn(item.calendarId));
  }

  async createCalendar(name, color) {
    const { F, db } = this.fb;
    const ref = F.doc(F.collection(db, 'calendars'));
    const cal = {
      name, color, owner: this.uid, memberIds: [this.uid],
      roles: { [this.uid]: 'owner' }, names: { [this.uid]: this.name },
      invites: {}, createdAt: new Date().toISOString(),
    };
    this.cals.set(ref.id, { ...cal, id: ref.id });
    this._watchCalendar(ref.id);
    this._emit();
    this._write(F.setDoc(ref, cal));
    return ref.id;
  }

  async updateCalendar(cid, patch) {
    const { F, db } = this.fb;
    this._write(F.updateDoc(F.doc(db, 'calendars', cid), patch));
  }

  async deleteCalendar(cid) {
    const { F, db } = this.fb;
    const events = [...(this.calEvents.get(cid)?.values() || [])];
    for (let i = 0; i < events.length; i += 400) {
      const batch = F.writeBatch(db);
      events.slice(i, i + 400).forEach((ev) => batch.delete(this._ref(ev)));
      this._write(batch.commit());
    }
    this._stopCalendar(cid);
    this.cals.delete(cid);
    this._emit();
    this._write(F.deleteDoc(F.doc(db, 'calendars', cid)));
  }

  // 招待リンクを作る（7 日間有効）。role: 'editor' | 'viewer'
  async createInvite(cid, role) {
    const { F, db } = this.fb;
    const token = randomToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 86400000);
    this._write(F.updateDoc(F.doc(db, 'calendars', cid), {
      [`invites.${token}`]: { role, expiresAt, createdAt: new Date().toISOString() },
    }));
    const cal = this.cals.get(cid);
    const base = `${location.origin}${location.pathname}`;
    return { token, url: `${base}#/join/${cid}/${token}/${role}/${encodeURIComponent(cal?.name || '')}`, expiresAt };
  }

  async removeInvite(cid, token) {
    const { F, db } = this.fb;
    this._write(F.updateDoc(F.doc(db, 'calendars', cid), { [`invites.${token}`]: F.deleteField() }));
  }

  async setMemberRole(cid, uid, role) {
    const { F, db } = this.fb;
    this._write(F.updateDoc(F.doc(db, 'calendars', cid), { [`roles.${uid}`]: role }));
  }

  async removeMember(cid, uid) {
    const { F, db } = this.fb;
    this._write(F.updateDoc(F.doc(db, 'calendars', cid), {
      memberIds: F.arrayRemove(uid), [`roles.${uid}`]: F.deleteField(), [`names.${uid}`]: F.deleteField(),
    }));
  }

  async leaveCalendar(cid) {
    await this.removeMember(cid, this.uid);
    this._stopCalendar(cid);
    this.cals.delete(cid);
    this._emit();
  }

  // 招待リンクから参加する（招待の確認はセキュリティルールが行う）
  async joinCalendar(cid, token, role) {
    const { F, db } = this.fb;
    await F.updateDoc(F.doc(db, 'calendars', cid), {
      memberIds: F.arrayUnion(this.uid), [`roles.${this.uid}`]: role, [`names.${this.uid}`]: this.name, lastJoin: token,
    });
  }
}
