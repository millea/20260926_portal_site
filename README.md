# MATO — 個人用情報ポータル

AI情報・LLM性能比較・投資・天気・ゲーム・イベント・子供の情報を集約する個人用ダッシュボードです。Firebase Hosting + Google認証 + Firestoreで、許可された自分のアカウントだけが閲覧します。GitHub Actionsが6時間ごとに公開情報を収集し、既読・保存は端末間で同期します。

## 設計資料

`specifications.md` → `design.md` → `task.md` の順で作成・更新し、その後に実装します。次回の作業ルールは `AGENTS.md` を参照してください。

## ローカルで画面を確認

Node.js 22以上、Python 3.12以上を用意します。

```powershell
npm ci
python scripts/collect.py --local
npm run dev
```

表示されたローカルURLを開きます。Firebaseを未設定の場合は「ローカルプレビュー」と明示され、取得した公開情報を表示します。このモードの既読・保存はそのブラウザだけに残ります。情報源が取得できない場合は前回データとエラー状態を保持し、収集コマンドは終了コード1を返します。

`data/local-feed.json` はGit管理・本番公開の両方から除外しています。Firebase設定済みの画面では認証エラー時もローカルJSONに切り替わりません。

## Firebaseの初回設定

1. Firebase ConsoleでプロジェクトとWebアプリを作成し、Cloud Firestoreを作成します。利用地域を決めてから作成してください。
2. Authentication > Sign-in methodでGoogleを有効化します。Authorized domainsに公開ホストを確認し、開発時は`localhost`、`127.0.0.1`を必要に応じて追加します。
3. `.env.example` を `.env.local` にコピーし、ConsoleのWeb設定を `VITE_FIREBASE_CONFIG` にJSON形式で入れます。Web設定は公開識別情報であり、サービスアカウント秘密鍵とは別物です。
4. Firebase CLIでログインし、ルールを先に公開します。

```powershell
npx firebase login
npx firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
```

5. `npm run dev` から自分のGoogleアカウントでログインします。初回は「閲覧権限がありません」と表示されます。画面またはAuthenticationのユーザー一覧からUIDを取得します。
6. Firestore Consoleに `access/{自分のUID}` ドキュメントを作り、Booleanフィールド `enabled: true` を登録します。許可登録はクライアントからはできません。
7. 画面で再読込します。許可された本人だけが情報と自分の既読・保存を読み書きできます。

本番ビルドはFirebase設定が不足すると失敗します。Firebase Hostingで配信されるHTML自体は公開ですが、収集内容と個人の状態は認証・Firestoreルールで保護します。

## 収集元とカテゴリを追加

`config/portal.json` の `categories` に追加すると、ナビゲーション・カテゴリ集計・一覧が増えます。

```json
{"id":"books","label":"本","icon":"folder","color":"blue","description":"気になる本の情報。"}
```

IDは英小文字で始まる英数字・ハイフン。重複と`dashboard`は不可。アイコンは`folder`、`sparkles`、`chart`、`sun`、`game`、`calendar`、`heart`等。色は`violet`、`green`、`amber`、`blue`、`orange`、`rose`。

`config/sources.json` の `sources` に収集元を追加します。

```json
{"id":"books-news","name":"公式ブログ","category":"books","type":"rss","enabled":true,"url":"https://example.com/feed.xml"}
```

RSS 2.0 / RSS 1.0 / Atomに対応しています。購読先が認める配信方法・利用条件に従い、全文転載を避けています。

SNSはBlueskyの公開投稿に対応。自分のSNSアカウントは不要で、取得先だけ指定します。

```json
{"id":"public-social","name":"公開投稿","category":"ai","type":"bluesky","enabled":true,"actor":"ACCOUNT.bsky.social"}
```

X、Instagram等は現在未対応です。利用可能な公式APIと取得対象を決めてからアダプターを追加します。

天気は東京都心（東京駅付近）と千葉市の3日予報を設定済み。千葉県全体の予報ではありません。`location`、`latitude`、`longitude`で地点を変更できます。出典は[Open-Meteo](https://open-meteo.com/)（CC BY 4.0）。

投資は日経平均・TOPIX・S&P 500・NASDAQ総合・NYダウ、トヨタ・ソニー・三菱UFJ・Apple・Microsoft・NVIDIAの確認用リンクを初期登録。価格APIは未接続です。指数や株価を自動集計する場合は、利用条件・日本株の対応範囲・料金・遅延を確認してプロバイダーを選定します。現在の実装で架空の価格は表示しません。

LLM性能比較にはArtificial Analysis・Arena・SWE-benchの比較ページを登録しています。評価軸を併記し、最新スコアは元サイトで確認します。ベンチマーク数値の自動取得は未接続です。

ゲーム・イベント・育児・LLM比較ニュースの情報源とBlueskyの取得先は未指定で、初期設定では無効です。`enabled: true` と有効なURL/アカウントを設定してください。

## GitHub Actions

GitHub Settings > Secrets and variables > Actionsに以下を設定します。

| 種類 | 名前 | 内容 |
| --- | --- | --- |
| Variable | `FIREBASE_PROJECT_ID` | FirebaseプロジェクトID |
| Variable | `FIREBASE_WEB_CONFIG` | WebアプリのFirebase設定JSON |
| Secret | `FIREBASE_COLLECTOR_SERVICE_ACCOUNT` | Firestore収集用サービスアカウントJSON |
| Secret | `FIREBASE_DEPLOY_SERVICE_ACCOUNT` | Hosting/ルール公開用サービスアカウントJSON |

収集用と公開用の資格情報は分けてください。収集用には対象プロジェクトのCloud Datastore UserなどFirestoreの読み書き権限、公開用にはFirebase Hosting Admin・Firebase Rules AdminおよびCLIが要求するプロジェクト参照権限を付与します。Owner権限を常用する必要はありません。秘密鍵をリポジトリへ保存しないでください。将来はWorkload Identity Federationへ切替可能です。

- `Collect public information`：JST 03:17 / 09:17 / 15:17 / 21:17と手動実行。Firestoreへ書き込み、リポジトリへのデータコミットは行いません。一部収集失敗時も成功データとエラー状態を保存し、ジョブは失敗として通知します。
- `Deploy Firebase`：手動実行。UIテスト、Firestoreルールテスト、本番ビルド後にHostingとルールを公開します。

scheduleはデフォルトブランチのワークフローに対して動作します。混雑時の遅延や、公開リポジトリで長期間活動がない場合の自動停止があるため、厳密な定時実行ではありません。[GitHub公式](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

FirestoreとHostingの利用量・無料枠をFirebase Consoleで確認してください。[料金とプラン](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)

## ローカルから本番に接続して収集

専用サービスアカウントを安全な場所に置き、`GOOGLE_APPLICATION_CREDENTIALS`をそのパスへ設定した環境で実行します。秘密鍵の内容をコマンドやログへ出さないでください。

```powershell
python -m pip install -r scripts/requirements.txt
python scripts/collect.py --firestore
```

設定から削除したソースはFirestoreからも削除します。無効化したソースの記事も表示対象から外します。旧記事の履歴アーカイブ機能はありません。

## 検証と公開

```powershell
python -m unittest discover -s tests -p 'test_*.py'
npm test
npm run test:rules
npm run build
```

FirestoreルールテストにはJava 21以上が必要です。依存関係は`package-lock.json`に固定されています。

`npm run test:ui` はEdgeを非表示で起動し、画面操作とモバイル幅を検証します。事前にローカル収集を行ってください。`npm run test:build` は検証用のダミー設定を使い、本番からプレビューコード・データが除外されることを確認します。出力先は公開用distと分離したartifacts/build-checkです。

公開するときは設定済み環境で次を実行するか、GitHub Actionsの`Deploy Firebase`を実行します。

```powershell
npx firebase deploy --only hosting,firestore:rules --project YOUR_PROJECT_ID
```

このリポジトリの生成だけではFirebaseプロジェクト作成、本人UID登録、Secrets設定、実際のデプロイは行われません。検証状況と残作業は `task.md` を参照してください。
