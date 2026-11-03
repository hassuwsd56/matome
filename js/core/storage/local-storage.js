// 保存先アダプター: iPhone 内（localStorage）に保存する
// 将来クラウド保存にする時は、同じ形（load / save）のアダプターを作って app.js で差し替える。
const KEY = 'matome:data';

export const localStorageAdapter = {
  async load() {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  },
  async save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  },
};
