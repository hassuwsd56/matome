import { h } from '../core/dom.js';
import { allTypes, getType } from '../types/registry.js';
import { toast } from './toast.js';

function defaultsFor(type, ctx) {
  const v = {};
  for (const f of type.fields) {
    v[f.key] = typeof f.default === 'function' ? f.default(ctx) : f.default ?? (f.input === 'toggle' ? false : '');
  }
  return v;
}

// 追加・編集の入力画面（下から出るシート）。項目は種類の fields から自動で作る。
export function openEditor(store, { item = null, typeId = null, ctx = {} } = {}) {
  const isNew = !item;
  let type = getType(item?.type ?? typeId ?? allTypes()[0].id);
  let values = isNew ? defaultsFor(type, ctx) : { ...item };

  const root = document.getElementById('sheet-root');
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  const backdrop = h('div', { class: 'backdrop', onclick: close });
  root.replaceChildren(backdrop, sheet);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));

  function close() {
    root.classList.remove('open');
    document.body.classList.remove('sheet-open');
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
  }

  function fieldEl(f) {
    const id = `f-${f.key}`;
    const set = (e) => { values[f.key] = e.target.value; };

    if (f.input === 'toggle') {
      return h('label', { class: 'field-toggle' },
        h('span', null, f.label),
        h('input', {
          type: 'checkbox', class: 'switch', checked: !!values[f.key],
          onchange: (e) => { values[f.key] = e.target.checked; render(); },
        })
      );
    }

    let control;
    if (f.input === 'textarea') {
      control = h('textarea', { id, rows: f.rows || 4, placeholder: f.placeholder, value: values[f.key] || '', oninput: set });
    } else if (f.input === 'date' || f.input === 'time') {
      const input = h('input', { id, type: f.input, value: values[f.key] || '', oninput: set, onchange: set });
      control = f.required
        ? input
        : h('div', { class: 'with-clear' }, input,
            h('button', { type: 'button', class: 'link-btn', onclick: () => { values[f.key] = ''; input.value = ''; } }, 'クリア'));
    } else {
      control = h('input', { id, type: 'text', placeholder: f.placeholder, value: values[f.key] || '', oninput: set, enterkeyhint: 'done' });
    }
    return h('div', { class: 'field' }, h('label', { for: id }, f.label), control);
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
    const header = h('div', { class: 'sheet-header' },
      h('button', { type: 'button', class: 'link-btn', onclick: close }, 'キャンセル'),
      h('div', { class: 'sheet-title' }, isNew ? '新規作成' : type.label),
      h('button', { type: 'button', class: 'link-btn strong', onclick: save }, isNew ? '追加' : '保存')
    );
    const picker = isNew
      ? h('div', { class: 'segmented' }, allTypes().map((t) =>
          h('button', { type: 'button', class: `seg${t === type ? ' active' : ''}`, onclick: () => switchType(t) }, t.label)))
      : null;
    const form = h('div', { class: 'form' }, type.fields.filter((f) => !isHidden(f)).map(fieldEl));
    sheet.replaceChildren(header, h('div', { class: 'sheet-body' }, picker, form, isNew ? null : deleteButton()));
  }

  render();
  if (isNew) sheet.querySelector('input[type=text], textarea')?.focus();
}
