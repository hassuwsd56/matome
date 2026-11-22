// Firebase（ログインとクラウド保存）の読み込み。
// ビルド作業なしで使えるよう、公式の配布元（gstatic）からモジュールを直接読み込む。
// Service Worker がこのファイル群をキャッシュするので、電波がない時も起動できる。
const VERSION = '12.6.0';
const BASE = `https://www.gstatic.com/firebasejs/${VERSION}`;

// Firebase の設定（秘密の情報ではない。データはセキュリティルールで守る）
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB6uQsTglvpd5fK5T7AsmuJvidDSsmUbew',
  authDomain: 'matome-3b4f2.firebaseapp.com',
  projectId: 'matome-3b4f2',
  storageBucket: 'matome-3b4f2.firebasestorage.app',
  messagingSenderId: '314903831737',
  appId: '1:314903831737:web:9437e588ed57ecfd50e768',
};

let loading = null;

// { auth, db, A: auth の関数群, F: firestore の関数群 } を返す
export function loadFirebase() {
  loading ??= (async () => {
    const [appMod, A, F] = await Promise.all([
      import(`${BASE}/firebase-app.js`),
      import(`${BASE}/firebase-auth.js`),
      import(`${BASE}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    const auth = A.initializeAuth(app, { persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence] });
    let db;
    try {
      // 端末内にも保存しておき、電波がない時も読み書きできるようにする
      db = F.initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
      });
    } catch (e) {
      console.warn('端末内キャッシュなしで起動します', e);
      db = F.initializeFirestore(app, { ignoreUndefinedProperties: true });
    }
    return { auth, db, A, F };
  })();
  loading.catch(() => { loading = null; });
  return loading;
}
