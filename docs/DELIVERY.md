# ArchMap の配布

## 静的サイト

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run verify:site
npm run bench:diagrams
npm run preview:site
```

`site-dist/` に次の成果物を生成します。

| パス | 内容 |
|---|---|
| `index.html` | 製品ページ |
| `playground/index.html` | 5種類の図のエディター |
| `examples/index.html` | サンプル集 |
| `syntax/index.html` | 全構文とアイコン検索 |
| `standalone.html` | オフラインで動く単一HTML |
| `assets/` | 同一サイトから読み込むJSとCSS |

相対パスを使うため、独自ドメインのルートでもGitHub Pagesのリポジトリ配下でも動きます。通常のマルチページ版はHTTP配信で使い、ファイルから直接開く場合は `standalone.html` を使います。外部フォント、CDN、分析サービス、レンダリングサーバーへのアクセスは不要です。

プレイグラウンドの下書きはブラウザーの `localStorage` に保存します。ブラウザーの設定で保存が無効になっている場合や `file://` の実装によって、保存が利用できないことがあります。ソースを `.archmap` ファイルとして保存できます。

## GitHub Pages

公開先: <https://ai-org-labs.github.io/archmap/>

`.github/workflows/pages.yml` は `main` へのpush、または手動の `workflow_dispatch` で起動します。

1. Node.js 22 と `npm ci --ignore-scripts` で依存関係を準備します。
2. 型検査、全テスト、ライブラリーと静的サイトのビルドを行います。
3. サイト、配布用ライブラリー、ドキュメント、ライセンスを `_site` にまとめます。
4. 相対アセット・全ページ・単一HTMLを検査し、描画ベンチマークを実行します。
5. GitHub Actions の公式 Pages artifact / deploy アクションで公開します。

リポジトリの Settings → Pages → Source は **GitHub Actions** を指定します。ワークフローには `contents: read`、`pages: write`、`id-token: write` を付与します。

## ライブラリー

新エンジンは `dist/diagrams.js` と `dist/diagrams.umd.cjs` に出力します。ESMは `parseDiagram`、`computeDiagramLayout`、`renderDiagram` と型定義、サンプル、アイコン登録APIを公開します。UMDはグローバル `ArchMapDiagrams` を公開します。

互換性のため旧エンジンの `dist/archmap.js`、拡張エントリー、`@archmap/lifecycle` はビルドを継続します。新しいサイトのUI・エンジンからそれらを読み込むことはありません。npm公開はGitHub Pagesデプロイとは別の手順です。

## 入力とSVG

DSLはデータとして解析し、JavaScriptやHTMLを実行しません。図の文字列はSVGへ出力するときにエスケープします。アイコンキーから任意のURLを取得しません。`registerIcon()` のSVG本文は信頼するアプリケーションが提供する拡張データとして扱い、未検証の外部SVGを渡さないでください。

パーサーの入力サイズ・要素数・座標などの上限、および図ごとの制約は [構文リファレンス](SYNTAX.md) に定義しています。
