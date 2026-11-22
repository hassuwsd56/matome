import { h } from '../core/dom.js';
import { toast } from '../ui/toast.js';

// Firebase のエラーを日本語に
const MESSAGES = {
  'auth/invalid-email': 'メールアドレスの形が正しくありません',
  'auth/missing-password': 'パスワードを入力してください',
  'auth/weak-password': 'パスワードは 6 文字以上にしてください',
  'auth/email-already-in-use': 'このメールアドレスはすでに登録されています。「ログイン」から入ってください',
  'auth/invalid-credential': 'メールアドレスかパスワードが違います',
  'auth/wrong-password': 'メールアドレスかパスワードが違います',
  'auth/user-not-found': 'このメールアドレスは登録されていません',
  'auth/too-many-requests': '試行回数が多すぎます。しばらく待ってからもう一度試してください',
  'auth/network-request-failed': 'ネットにつながっていません',
};
export const authMessage = (e) => MESSAGES[e?.code] || `エラーが発生しました（${e?.code || e?.message || '不明'}）`;

// ログイン・新規登録の画面（ログインするまでタブバーなどは隠す）
export function showAuthScreen(fb, { onLocal }) {
  const { auth, A } = fb;
  const view = document.getElementById('view');
  document.getElementById('page-title').textContent = 'まとめ帳';
  document.body.classList.add('auth-mode');
  let mode = 'login'; // 'login' | 'signup'
  const joining = /^#\/join\//.test(location.hash);

  function render() {
    const name = h('input', { id: 'auth-name', type: 'text', placeholder: '例: しょうご', autocomplete: 'nickname' });
    const email = h('input', { id: 'auth-email', type: 'email', placeholder: 'mail@example.com', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off' });
    const pass = h('input', { id: 'auth-pass', type: 'password', placeholder: '6 文字以上', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
    const submit = h('button', { type: 'submit', class: 'btn primary', id: 'auth-submit' }, mode === 'login' ? 'ログイン' : '登録してはじめる');

    const form = h('form', {
      class: 'form auth-form',
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          if (mode === 'login') {
            await A.signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
          } else {
            if (!name.value.trim()) throw { code: 'local/name' };
            // 登録直後にアプリが始まるので、表示名は app.js でも確実に反映させる
            localStorage.setItem('matome:pendingName', name.value.trim());
            const cred = await A.createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
            await A.updateProfile(cred.user, { displayName: name.value.trim() });
          }
          // ログイン後の処理は app.js の onAuthStateChanged が行う
        } catch (err) {
          toast(err.code === 'local/name' ? '表示名を入力してください' : authMessage(err));
          submit.disabled = false;
        }
      },
    },
      mode === 'signup'
        ? h('div', { class: 'field' }, h('label', { for: 'auth-name' }, '表示名（共有カレンダーで相手に見える名前）'), name)
        : null,
      h('div', { class: 'field' }, h('label', { for: 'auth-email' }, 'メールアドレス'), email),
      h('div', { class: 'field' }, h('label', { for: 'auth-pass' }, 'パスワード'), pass),
      submit
    );

    const forgot = h('button', {
      type: 'button', class: 'link-btn',
      onclick: async () => {
        if (!email.value.trim()) return toast('メールアドレスを入力してから押してください');
        try {
          await A.sendPasswordResetEmail(auth, email.value.trim());
          toast('パスワード再設定のメールを送りました');
        } catch (err) {
          toast(authMessage(err));
        }
      },
    }, 'パスワードを忘れた');

    view.replaceChildren(h('div', { class: 'auth' },
      joining ? h('div', { class: 'banner info' }, '共有カレンダーに招待されています。ログイン（はじめての方は登録）すると参加できます。') : null,
      h('div', { class: 'card' },
        h('div', { class: 'segmented' },
          h('button', { type: 'button', class: `seg${mode === 'login' ? ' active' : ''}`, onclick: () => { mode = 'login'; render(); } }, 'ログイン'),
          h('button', { type: 'button', class: `seg${mode === 'signup' ? ' active' : ''}`, onclick: () => { mode = 'signup'; render(); } }, 'はじめて使う')
        ),
        form,
        mode === 'login' ? h('div', { class: 'auth-links' }, forgot) : null
      ),
      h('div', { class: 'card' },
        h('h2', null, 'ログインすると'),
        h('p', null, '・iPhone と PC で同じデータを見られます'),
        h('p', null, '・データはクラウドに保存され、端末をなくしても消えません'),
        h('p', null, '・共有カレンダーで、家族や友だちと予定を共有できます')
      ),
      joining ? null : h('button', { type: 'button', class: 'btn', id: 'auth-local', onclick: onLocal }, 'ログインせずに使う（この端末だけに保存）')
    ));
  }
  render();
}

export function hideAuthScreen() {
  document.body.classList.remove('auth-mode');
}
