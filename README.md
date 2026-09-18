# ArchMap

テキストから、読みやすい設計図へ。ブラウザーだけで動く、5種類の図に絞ったダイアグラムツールです。

[Playground](https://ai-org-labs.github.io/archmap/playground/) · [構文リファレンス](https://ai-org-labs.github.io/archmap/syntax/) · [サンプル](https://ai-org-labs.github.io/archmap/examples/)

## 描くもの

| 種類 | 宣言 | 用途 |
|---|---|---|
| システム構成図 | `diagram system LR` | サービス、クラウド、データの接続 |
| レイヤースタック図 | `diagram layers` | 責務と依存関係の積層 |
| シーケンス図 | `diagram sequence` | 参加者とメッセージの時系列 |
| 画面遷移図 | `diagram screens LR` | 画面とユーザーの移動 |
| アクティビティ図 | `diagram activity` | 開始、分岐、処理、終了 |

共通の小さな構文、グリッド配置、直交コネクター、複数行ラベル、グループ、アイコンを使います。UIは図の作成に集中し、3D・オーバーレイ・運用分析・ライフサイクル管理は扱いません。

```archmap
diagram system LR
title "小さな Web システム"
node web "Web アプリ" icon=browser
node api "API" icon=server
node db "データベース" icon=database shape=database
web -> api "HTTPS"
api -> db "SQL"
```

[完全な構文定義](docs/SYNTAX.md)には、全キーワード、オプション、制約、診断、各図の意味を記載しています。構成が密な場合は `at=列,行` で配置を調整できます。任意のグラフで交差がゼロになることを保証するものではありません。

## ローカルで使う

```sh
npm ci --ignore-scripts
npm run dev
```

Viteが表示するURLを開きます。プレイグラウンドは入力を自動描画し、ブラウザー内に下書きを保存します。`.archmap` 読み込み、ソース・SVG・PNGの保存に対応しています。

プレビューの「エディタを隠す」で図を広く表示できます。ドラッグで移動、ホイールでカーソル位置を中心にズームし、`Fit` で全体表示へ戻ります。キャンバスにフォーカスすると矢印キーで移動、`+` / `-` でズーム、`0` で全体表示に戻せます。オフライン版でも同じ操作が使えます。

```sh
npm run build:site
npm run preview:site
```

`site-dist/` が静的サイトです。`site-dist/standalone.html` は JavaScript・CSS・アイコン・構文リファレンスを内包した単一ファイルで、ダブルクリックで起動できます。サーバー、CDN、アカウントは不要です。ファイルから開く場合の下書き保存可否はブラウザーに依存します。

## ライブラリーとして使う

リポジトリをビルドすると、軽量エンジンを `dist/diagrams.js`（ESM）と `dist/diagrams.umd.cjs`（UMD）に出力します。次の公開バージョンからは `@archmap/core/diagrams` を利用できます。

```js
import { parseDiagram, renderDiagram } from './dist/diagrams.js';

const model = parseDiagram(source);
if (!model.diagnostics.some(item => item.severity === 'error')) {
  const result = renderDiagram(model);
  document.querySelector('#diagram').innerHTML = result.svg;
}
```

`computeDiagramLayout(model)` で配置座標を取得できます。`registerIcon(key, {viewBox, body})` で信頼できるSVGアイコンを登録できます。コアエンジンにはベンダーアイコンを含めず、プレイグラウンドにはAWS・Google Cloud・Azure・主要サービス・汎用アイコンを同梱します。構文ページで利用可能なキーを検索できます。ロゴの権利は各所有者に帰属します。

## GitHub Pages

`.github/workflows/pages.yml` が `main` へのpush時に型検査・テスト・ビルド・静的資産検査・描画ベンチマークを実行し、GitHub Pagesに公開します。プロジェクト配下でも動く相対パスで出力します。詳細は [配布手順](docs/DELIVERY.md) を参照してください。

## 検証

```sh
npm run verify:diagrams
```

5種類のサンプルと40ノード構成、400ノード・200グループ構成、400ノード・1,000接続構成の計測は `npm run bench:diagrams` で実行します。結果は実行端末依存の `parse + layout + SVG` 時間であり、ブラウザーの描画時間は含みません。

## 旧構文からの移行

新しいプレイグラウンドは `diagram ...` 構文専用です。従来の `graph LR` とYAMLによる構文は、自動変換せず診断を表示します。既存の `@archmap/core` APIと拡張パッケージは互換性維持のため残しています。従来の仕様は [旧構文リファレンス](docs/LEGACY_SYNTAX.md) を参照してください。

- `graph LR` → `diagram system LR`
- `Web[Web App]` → `node Web "Web App"`
- `Web -->|HTTPS| API` → `Web -> API "HTTPS"`
- YAMLの `provider` / `kind` → `icon=aws/lambda` など
- YAMLのゾーン → `group` 宣言とノードの `group=...`

Apache-2.0 · [LICENSE](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
