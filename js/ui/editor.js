import { h } from '../core/dom.js';
import { allTypes, getType } from '../types/registry.js';
import { toast } from './toast.js';
import { lockScroll, unlockScroll, fitToVisibleArea } from './sheet.js';
import { EVENT_COLORS } from '../core/colors.js';

function defaultsFor(type, ctx) {
  const v = {};
  for (const f of type.fields) {
    v[f.key] = typeof f.default === 'function' ? f.default(ctx) : f.default ?? (f.input === 'toggle' ? false : '');
  }
  return v;
}

// 本文欄を画面いっぱいに広げる種類か（メモ）
const isFillType = (type) => type.fields.some((f) => f.fill);

// 追加・編集の入力画面（下から出るシート）。項目は種類の fields から自動で作る。
export function openEditor(store, { item = null, typeId = null, ctx = {} } = {}) {
  const isNew = !item;
  let type = getType(item?.type ?? typeId ?? allTypes()[0].id);
  let values = isNew ? defaultsFor(type, ctx) : { ...item };
  if (!isNew && type.normalize) values = type.normalize(values);
  // 共有カレンダーの「見るだけ」の予定は、表示のみ（保存・削除できない）
  const readOnly = !isNew && store.canEdit && !store.canEdit(item);

  const root = document.getElementById('sheet-root');
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  const openedAt = Date.now();
  // 開いた時のタップが背景に届いてすぐ閉じるのを防ぐ
  const backdrop = h('div', { class: 'backdrop', onclick: () => { if (Date.now() - openedAt > 400) close(); } });
  root.replaceChildren(backdrop, sheet);
  document.body.classList.add('sheet-open');
  lockScroll();
  const fitting = fitToVisibleArea(sheet, { fill: () => isFillType(type) });
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.activeElement?.blur?.();
    fitting();
    root.classList.remove('open');
    document.body.classList.remove('sheet-open');
    unlockScroll();
    setTimeout(() => { if (!root.classList.contains('open')) root.replaceChildren(); }, 300);
  }

  const isHidden = (f) => !!f.hiddenWhen?.(values);

  async function save() {
    let data = {};
    for (const f of type.fields) {
      let v = values[f.key];
      if (typeof v === 'string' && f.input !== 'textarea') v = v.trim();
      data[f.key] = v;
    }
    const missing = type.fields.find((f) => f.required && !isHidden(f) && !data[f.key]);
    if (missing) return toast(`${missing.label}を入力してください`);
    const err = type.validate?.(data);
    if (err) return toast(err);
    if (type.beforeSave) data = type.beforeSave(data, item);
    try {
      if (isNew) await store.add(type.id, data);
      else await store.update(item.id, data);
      close();
    } catch (e) {
      console.error(e);
      toast('保存に失敗しました');
    }
  }

  function switchType(next) {
    if (next === type) return;
    const carry = {};
    for (const f of next.fields) if (type.fields.some((g) => g.key === f.key)) carry[f.key] = values[f.key];
    type = next;
    values = { ...defaultsFor(next, ctx), ...carry };
    render();
    fitting.update();
  }

  // 入力欄（key → 要素）。onFieldChange で他の欄の値を直した時に表示も合わせる。
  const inputs = new Map();

  function changed(key, value) {
    const prev = values[key];
    values[key] = value;
    if (value === prev) return;
    const patch = type.onFieldChange?.(key, values, prev);
    if (!patch) return;
    Object.assign(values, patch);
    for (const k of Object.keys(patch)) {
      const el = inputs.get(k);
      if (el) el.value = patch[k] ?? '';
    }
  }

  function control(f, id) {
    const set = (e) => changed(f.key, e.target.value);
    let el;
    if (f.input === 'color') {
      // 色: 「カレンダーの色」（空）か、候補の色から選ぶ
      const pick = (v) => (e) => {
        changed(f.key, v);
        el.querySelectorAll('.color-dot').forEach((x) => x.classList.toggle('on', x === e.currentTarget));
      };
      el = h('div', { class: 'color-picker', id },
        h('button', { type: 'button', class: `color-dot auto${!values[f.key] ? ' on' : ''}`, disabled: readOnly, onclick: pick('') }, f.autoLabel || '自動'),
        EVENT_COLORS.map((c) => h('button', {
          type: 'button', class: `color-dot${values[f.key] === c ? ' on' : ''}`, style: `background:${c}`,
          'aria-label': `色 ${c}`, dataset: { color: c }, disabled: readOnly, onclick: pick(c),
        })));
      inputs.set(f.key, el);
      return el;
    }
    if (f.input === 'select') {
      el = h('select', { id, onchange: set }, selectOptions(f).map((o) => {
        const opt = h('option', { value: o.value }, o.label);
        if ((values[f.key] || '') === o.value) opt.selected = true;
        return opt;
      }));
    } else if (f.input === 'textarea') {
      el = h('textarea', { id, rows: f.rows || 4, placeholder: f.placeholder, value: values[f.key] || '', oninput: set });
    } else if (f.input === 'date' || f.input === 'time') {
      el = h('input', { id, type: f.input, value: values[f.key] || '', oninput: set, onchange: set });
    } else {
      el = h('input', { id, type: 'text', placeholder: f.placeholder, value: values[f.key] || '', oninput: set, enterkeyhint: 'done' });
    }
    if (readOnly) el.disabled = true;
    inputs.set(f.key, el);
    return el;
  }

  // 選択肢（options(store, item) が返す [{ value, label }]）
  const selectOptions = (f) => f.options?.(store, item) || [];

  function fieldEl(f) {
    const id = `f-${f.key}`;

    if (f.input === 'toggle') {
      return h('label', { class: 'field-toggle' },
        h('span', null, f.label),
        h('input', {
          type: 'checkbox', id, class: 'switch', checked: !!values[f.key], disabled: readOnly,
          onchange: (e) => { changed(f.key, e.target.checked); render(); },
        })
      );
    }

    const input = control(f, id);
    const ctl = (f.input === 'date' || f.input === 'time') && !f.required && !readOnly
      ? h('div', { class: 'with-clear' }, input,
          h('button', { type: 'button', class: 'link-btn', onclick: () => { changed(f.key, ''); input.value = ''; } }, 'クリア'))
      : input;
    return h('div', { class: `field${f.fill ? ' fill' : ''}` }, h('label', { for: id }, f.label), ctl);
  }

  // group が同じ項目（例: 開始日と開始時刻）は 1 行に並べる
  function groupEl(label, fields) {
    return h('div', { class: 'field' },
      h('label', { for: `f-${fields[0].key}` }, label),
      h('div', { class: 'field-row' }, fields.map((f) => {
        const el = control(f, `f-${f.key}`);
        el.setAttribute('aria-label', f.label);
        if (f.required || f.input !== 'time' || readOnly) return el;
        // 時刻は「×」で未定に戻せる
        return [el, h('button', {
          type: 'button', class: 'clear-btn', 'aria-label': `${f.label}をクリア`,
          onclick: () => { changed(f.key, ''); el.value = ''; },
        }, '×')];
      })));
  }

  function formItems() {
    const out = [];
    // 選択肢のない select（ログインしていない時のカレンダー欄）は出さない
    const visible = type.fields.filter((f) => !isHidden(f) && !(f.input === 'select' && selectOptions(f).length === 0));
    for (let i = 0; i < visible.length; i++) {
      const f = visible[i];
      if (!f.group) { out.push(fieldEl(f)); continue; }
      const members = [f];
      while (visible[i + 1]?.group === f.group) members.push(visible[++i]);
      out.push(groupEl(f.groupLabel || f.label, members));
    }
    return out;
  }

  function deleteButton() {
    let armed = false;
    let timer;
    const btn = h('button', {
      type: 'button',
      class: 'danger-btn',
      onclick: async () => {
        if (!armed) {
          armed = true;
          btn.textContent = 'もう一度タップで削除';
          timer = setTimeout(() => { armed = false; btn.textContent = '削除'; }, 3000);
          return;
        }
        clearTimeout(timer);
        await store.remove(item.id);
        close();
        toast('削除しました');
      },
    }, '削除');
    return btn;
  }

  function render() {
    inputs.clear();
    sheet.classList.toggle('fill', isFillType(type));
    const header = h('div', { class: 'sheet-header' },
      h('button', { type: 'button', class: 'link-btn', onclick: close }, 'キャンセル'),
      h('div', { class: 'sheet-title' }, isNew ? '新規作成' : readOnly ? `${type.label}（見るだけ）` : type.label),
      readOnly
        ? h('span', { class: 'link-btn placeholder' }, '')
        : h('button', { type: 'button', class: 'link-btn strong', onclick: save }, isNew ? '追加' : '保存')
    );
    const picker = isNew
      ? h('div', { class: 'segmented' }, allTypes().map((t) =>
          h('button', { type: 'button', class: `seg${t === type ? ' active' : ''}`, onclick: () => switchType(t) }, t.label)))
      : null;
    // 共有しているカレンダーの予定は、誰が入れたかを出す
    const by = !isNew && type.createdByName?.(item, store);
    const form = h('div', { class: 'form' }, by ? h('p', { class: 'created-by' }, `入れた人：${by}`) : null, formItems());
    sheet.replaceChildren(header, h('div', { class: 'sheet-body' }, picker, form, isNew || readOnly ? null : deleteButton()));
  }

  render();
  if (isNew) sheet.querySelector('input[type=text], textarea')?.focus({ preventScroll: true });
}
