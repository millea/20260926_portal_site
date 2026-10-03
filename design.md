# 個人用情報ポータル 設計書

## アーキテクチャ
Vite + vanilla JavaScript + Firebase JS SDK。Firebase Hostingでdistを公開。AuthenticationのGoogleログイン後、Firestoreの許可を確認して購読開始。未接続のローカル開発だけJSONプレビューを許可する。

config/portal.jsonにカテゴリと投資ウォッチリスト、config/sources.jsonに収集対象を定義する。カテゴリの追加はportal.jsonへの追記でナビ・集計・一覧に反映される。カテゴリIDは英小文字と数字・ハイフンのみでdashboardは予約。

## UI
仮称MATO。左にカテゴリ、上部にパンくずと検索・再読込・ログイン状態。本文に概要カードと記事一覧、右にカテゴリ集計と収集状態。カテゴリ切替はURLハッシュ。投資では設定された指数・株の元サイトへのリンクも表示。白とグレーの背景、ティールのアクセント、細い罫線と余白を使用。

760px以下ではサイドバーを開閉式にし、概要を2列、記事情報を折り返す。モーダルはdialog要素でフォーカスを管理。外部文字列はtextContentで描画する。

LLM性能比較は`llm`カテゴリとし、portal.jsonのbenchmarksから評価サイトへのリンクを表示する。各サイトの評価観点を併記し、未接続のスコアは表示しない。関連記事の情報源もsources.jsonで追加できる。

## Firestoreデータモデル
- access/{uid}: {enabled: true}。管理者のみ作成。本人は自分の許可情報を読めるが変更不可。
- feeds/{sourceId}: {id,name,category,type,status,lastSuccessAt,attemptedAt,message,items:[]}。クライアントは許可ユーザーのみ読み取り、書き込みはAdmin SDKのみ。
- users/{uid}/items/{articleId}: {read: boolean,saved: boolean,updatedAt: timestamp}。本人かつ許可済みのみ読み書き可能。フィールドと型をルールで制限。

記事: id, sourceId, source, category, title, summary, url, publishedAt, collectedAt。idはsourceId+URLのSHA256から生成。1ソース30件・抜粋180文字まで。ソース単位の1ドキュメントで読み取り回数を抑える。日付不明はnull。

購読はonSnapshot。ユーザー変更/ログアウト時に購読解除と表示データを消去。永続ディスクキャッシュは有効化しない。認証/許可/接続エラー時はローカルデータへ降格しない。保存失敗は通知し画面状態をロールバックする。

## 収集
Python標準ライブラリでRSS/Atom、Bluesky公開AppView、Open-Meteoを取得。Firestore接続のみfirebase-adminを使う。--localはローカルJSONへ出力、--firestoreは既存のソーススナップショットを読み、取得結果を更新する。設定から削除したソースはFirestoreから削除する。

タイムアウト・応答サイズ制限を付ける。XMLのDOCTYPE/ENTITYは拒否。URLはHTTP/HTTPSで検証。ソース単位に失敗を隔離し、旧記事と最終成功時刻を保持する。無効ソースはdisabled状態・空記事にする。ソースごとURL重複除去。天気は東京都心と千葉市の3日予報。SNSはBlueskyの公開投稿を対象とし、未指定アカウントは無効状態。

## ワークフロー
collect.yml: UTC 00:17/06:17/12:17/18:17（JST 09:17/15:17/21:17/03:17）と手動実行。テスト後、Firestoreへ直接書き込み。収集内容をリポジトリにコミットしない。

deploy.yml: 手動実行。npm ci、テスト、Firebase設定を環境変数から注入、ビルド、Hosting/Firestoreルールをデプロイ。公開物はdistだけでローカルJSONや収集設定、資格情報は含めない。

## 認証と運用
Web設定はVITE_FIREBASE_CONFIGのJSON。Web APIキーは公開識別情報だがデータの保護はSecurity Rulesと許可リストで行う。専用サービスアカウントのJSONはGitHub Secret FIREBASE_COLLECTOR_SERVICE_ACCOUNTとFIREBASE_DEPLOY_SERVICE_ACCOUNT、プロジェクトIDはVariable FIREBASE_PROJECT_ID、Web設定はVariable FIREBASE_WEB_CONFIG。初期設定でGoogleログインを有効化し、所有者のUIDを許可リストに登録する。サービスアカウントは収集用とデプロイ用を分離する。

### 開発者のGitHub MCP
GitHub公式リモートMCPをCodex共通設定（通常は`%USERPROFILE%\.codex\config.toml`）に登録する。接続先は`https://api.githubcopilot.com/mcp/`、認証情報はユーザー環境変数から読み込ませ、リポジトリ内には保存しない。MCP登録一覧で有効状態を確認後、対象リポジトリのIssue一覧など必要な読み取り操作を実行してアクセスを確認する。PATは対象リポジトリ・操作に必要な最小権限とし、具体的な権限名はGitHubの現在のPAT設定画面と公式MCPガイドで確認する。GitHub MCPは本サイトの実行時アーキテクチャには含まれない。

## 検証
Python unittestで解析と障害耐性。node:testでUIのフィルタ・URL検証など純粋ロジック。Firestore Emulatorのルールテストで未認証・未許可・本人・他人・改ざんを検証。実プロジェクトが未提供の場合、本番ログイン・Firestore・公開は未検証として明記する。
