# まとめ帳

予定・タスク・メモをひとつにまとめた、自分用の iPhone 向け Web アプリ（PWA）です。
ビルド作業は不要で、ファイルをそのまま置くだけで動きます。

## 機能（v0.1）
- **今日**: 今日の予定、今日までのタスク（期限切れを含む）、期限なしのタスク
- **カレンダー**: 月表示。日付をタップすると、その日の予定・タスクを表示
- **メモ**: 一覧と検索
- **設定**: バックアップの書き出し（iPhone では共有シート →「"ファイル"に保存」）と復元
- オフラインで動作し、ダークモードで表示
- 最後のバックアップから7日経つと「今日」画面にお知らせを表示

データは端末内（localStorage）に保存されます。**ホーム画面からアプリを削除するとデータも消えます。**

## 公開手順（GitHub Pages）
1. GitHub で新しいリポジトリを作成（例: `matome`）。Public にする。
2. 「Add file」→「Upload files」で、このフォルダの中身をすべてドラッグ＆ドロップして Commit。
   （`css` `icons` `js` フォルダごとドロップすれば、フォルダ構成も保たれます）
3. リポジトリの「Settings」→「Pages」→ Source を「Deploy from a branch」、Branch を `main` / `/(root)` にして Save。
4. 1〜2分後に `https://<ユーザー名>.github.io/matome/` で開けるようになる。
5. iPhone の Safari でその URL を開き、共有ボタン →「ホーム画面に追加」。

### 更新するとき
変更したファイルを同じ手順で上書きアップロードします。アプリはネットにつながった時に最新版を読み込みます。
反映されない時は、アプリを一度閉じて開き直してください。

## PC で動作確認する
```
cd C:\Users\skyio\schedule-app
py -m http.server 8765
```
ブラウザで http://localhost:8765 を開きます。

## フォルダ構成
```
index.html              画面の土台
manifest.webmanifest    ホーム画面アプリとしての設定
sw.js                   オフライン対応
css/style.css           見た目（先頭の :root で色を一括管理）
js/
  app.js                起動処理・画面切り替え
  config.js             アプリ名・バージョン・バックアップ通知の日数
  core/                 土台部分（画面に依存しない）
    store.js            データの読み書きの窓口
    schema.js           データの形とバージョン変換
    storage/            保存先（今は端末内。クラウドに変える時はここに追加）
    date.js / dom.js    日付・画面部品の小道具
  types/                アイテムの種類（予定・タスク・メモ）
  views/                画面（今日・カレンダー・メモ・設定）
  ui/                   共通の画面部品（入力シート、一覧の行など）
  features/backup.js    バックアップ
```

## 拡張のしかた
| やりたいこと | 触る場所 |
|---|---|
| 新しい種類（例: 習慣）を足す | `js/types/` にファイルを作り、`js/types/index.js` に登録。入力画面は `fields` から自動で作られ、`todaySections` を書けば「今日」に、`occursOn` を書けばカレンダーに出る |
| 既存の種類に項目を足す（例: 場所） | その種類の `fields` に1行足す |
| 新しい画面（タブ）を足す | `js/views/` にファイルを作り、`js/views/index.js` に足す |
| 保存先をクラウドにする | `js/core/storage/` に `load()` / `save()` を持つアダプターを作り、`js/app.js` で差し替える |
| データの形を変える | `js/core/schema.js` の `SCHEMA_VERSION` を上げ、`migrations` に変換を書く（古いバックアップも読める） |
| 色を変える | `css/style.css` の `:root` |
