import { createEmptyData, migrate } from './schema.js';

const newId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// アプリ全体のデータを持つ入れ物。画面はここを通してだけデータを読み書きする。
export class Store {
  constructor(adapter) {
    this.adapter = adapter;
    this.data = createEmptyData();
    this.listeners = new Set();
  }

  async init() {
    const raw = await this.adapter.load();
    this.data = raw ? migrate(raw) : createEmptyData();
  }

  // データが変わった時に呼ばれる関数を登録
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async _commit() {
    await this.adapter.save(this.data);
    for (const fn of this.listeners) fn();
  }

  items(filter) {
    return filter ? this.data.items.filter(filter) : this.data.items.slice();
  }

  get(id) {
    return this.data.items.find((i) => i.id === id) || null;
  }

  async add(type, fields) {
    const now = new Date().toISOString();
    const item = { ...fields, id: newId(), type, createdAt: now, updatedAt: now };
    this.data.items.push(item);
    await this._commit();
    return item;
  }

  async update(id, patch) {
    const i = this.data.items.findIndex((it) => it.id === id);
    if (i < 0) return null;
    const prev = this.data.items[i];
    this.data.items[i] = { ...prev, ...patch, id, type: prev.type, updatedAt: new Date().toISOString() };
    await this._commit();
    return this.data.items[i];
  }

  async remove(id) {
    this.data.items = this.data.items.filter((it) => it.id !== id);
    await this._commit();
  }

  getMeta(key) {
    return this.data.meta[key] ?? null;
  }

  async setMeta(key, value) {
    this.data.meta[key] = value;
    await this._commit();
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.data));
  }

  async replaceAll(data) {
    this.data = migrate(data);
    await this._commit();
  }
}
