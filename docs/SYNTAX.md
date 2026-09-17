# ArchMap Syntax Reference

このリファレンスは、新しいプレイグラウンドと `@archmap/core/diagrams` が実装する構文をすべて定義します。対応する図は、システム構成図、レイヤースタック図、シーケンス図、画面遷移図、アクティビティ図の 5 種類です。

旧 `graph` + YAML 構文は [LEGACY_SYNTAX.md](./LEGACY_SYNTAX.md) に保存しています。旧 API と新しい構文は別のパーサーを使用します。

## 最小の図

```archmap
diagram system LR
title "小さな注文サービス"

node browser "Web アプリ" icon=browser
node api "Orders API" description="注文を受け付ける" icon=server
node database "Database" icon=database shape=database color=green

browser -> api "HTTPS"
api -> database "SQL"
```

1 行に 1 文を記述します。空行とコメントを除く最初の文は `diagram` 宣言です。ノードは少なくとも 1 個必要です。文末のセミコロン、波括弧によるブロック、YAML セクションは使用しません。コードフェンスは Markdown 上での表示用です。プレイグラウンドやパーサーへはフェンスの内側だけを渡します。

## 構文一覧

角括弧 `[...]` はこの表での省略可能な要素を示します。ソースに角括弧を入力する必要はありません。

```text
diagram system|layers|sequence|screens|activity [LR|TD]
style cards|icons
title "タイトル"
group ID "ラベル" [color=COLOR]
node ID "ラベル" [description="説明"] [icon=KEY] [group=ID] [at=列,行] [shape=SHAPE] [color=COLOR]
ID -> ID ["ラベル"]
ID --> ID ["ラベル"]
ID <-> ID ["ラベル"]
```

コマンド、種類、方向、オプション名、列挙値は大文字・小文字を区別します。複数のノードオプションは任意の順序で指定できます。同じオプションを繰り返すとエラーです。`=` と矢印の前後には任意に空白を入れられます。

### ID

ノードとグループの ID は、英字または `_` で始まり、その後に英数字、`_`、`-` を使用できます。正規表現は `[A-Za-z_][A-Za-z0-9_-]*` です。

```text
api
Orders_API
orders-v2
_internal
```

`9api`、`注文`、`api.v2` は ID にできません。表示する日本語はラベルに記述します。ノードとグループは同じ ID 空間を共有し、重複を許可しません。`title` などのコマンド名も ID として使用できます。接続と `group=ID` は宣言より前に記述できますが、文書内に対応する宣言が必要です。接続先にはグループではなくノードを指定します。

### 文字列とコメント

ラベル、タイトル、説明はダブルクォートで囲みます。シングルクォートは文字列の区切りになりません。次の 3 種類のエスケープだけを使用できます。

| ソース | 表示される文字 |
| --- | --- |
| `\n` | 改行 |
| `\"` | ダブルクォート |
| `\\` | バックスラッシュ |

```archmap
diagram system
# 行全体のコメント
node api "Orders\nAPI" description="\"確定\" を処理" // 行末のコメント
node browser "Browser" description="https://example.test/#orders"
browser -> api "POST /orders"
```

`#` または `//` から行末まではコメントです。ただし、ダブルクォートの内側では通常の文字として扱います。文字列そのものをソース上で複数行に分割する代わりに `\n` を使用します。空、または空白だけのラベルとタイトルはエラーです。空の説明 `description=""` は使用できます。接続ラベルは省略可能です。

HTML と Markdown の装飾は解釈しません。表示文字列は SVG 用にエスケープされます。XML 1.0 で禁止された制御文字、U+FFFE、U+FFFF、不正なサロゲートは入力エラーになります。通常の日本語、絵文字、タブは使用できます。

## `diagram` — 図の種類と方向

| 種類 | 用途 | 既定方向 | 指定できる方向 |
| --- | --- | --- | --- |
| `system` | サービス、データ、インフラの構成 | `LR` | `LR`、`TD` |
| `layers` | レイヤーと責務の依存関係 | `TD` | `TD` |
| `sequence` | 参加者間の時系列メッセージ | `LR` | `LR` |
| `screens` | 画面と操作による遷移 | `LR` | `LR`、`TD` |
| `activity` | 処理、判断、分岐 | `TD` | `LR`、`TD` |

`LR` は左から右、`TD` は上から下です。`diagram` は文書の最初に一度だけ指定します。異なる図の種類を 1 文書に混在させることはできません。

システム構成図、画面遷移図、アクティビティ図では、接続関係と方向からグリッドへ自動配置します。手動位置の指定があるノードはその位置を優先します。循環する接続と自身への接続も記述できます。

## `style` — カード表示とアイコン表示

```archmap
diagram system TD
style icons
title "アイコン中心の構成図"
group cloud "Google Cloud" color=blue
node api "Cloud Run" icon=gcp/cloud_run group=cloud at=1,1
node db "Cloud SQL" icon=gcp/cloud_sql shape=database group=cloud at=1,2
api -> db "SQL"
```

`style cards` は標準のカード表示、`style icons` は大きなアイコンの下に名前と説明を置く表示です。省略時は `cards` です。`diagram` 宣言の後に一度だけ指定できます。

`icons` は `system` と `layers` で利用できます。`card` と `database` の枠を省き、48 px のアイコンを表示します。アイコン未指定・未登録の場合は汎用のサーバー／データベースアイコンで表示します。`decision`、`start`、`end` は意味を表す図形を維持します。`sequence`、`screens`、`activity` では `cards` のみ使用できます。

アイコンの左右と上側に接続し、下側では名前・説明の領域を避けて接続します。グループ、グリッド配置、接続ラベルは共通です。グループの入れ子はこのモードでも未対応です。

Playground の「表示」から切り替えると、ソースの `style` 宣言も更新されます。保存・再読み込み・SVG／PNG 出力・オフライン版にも反映されます。

## `title` — 図のタイトル

```archmap
title "注文サービスの構成"
```

省略すると図のタイトルは表示されません。1 文書に一度だけ、120 文字まで指定できます。

## `group` — 境界とレイヤー

```archmap
group platform "Google Cloud" color=blue
node api "API" group=platform
```

| 要素 | 必須 | 説明 |
| --- | --- | --- |
| ID | はい | ノードの `group=ID` から参照する一意の ID |
| ラベル | はい | ダブルクォートで囲む表示名。120 文字まで |
| `color` | いいえ | `blue`、`green`、`orange`、`purple`、`gray`。既定は `blue` |

`system`、`screens`、`activity` では、グループのメンバーを囲む領域として表示します。ノードが所属できるグループは 1 つです。グループの入れ子は使用できません。メンバーがいないグループは描画されません。手動配置では、別グループのノードを同じ領域に挟まないよう位置を指定してください。

`layers` では、グループ宣言の順に上から下へレイヤーを配置し、各レイヤーのノードを宣言順に左から右へ並べます。グループに所属しないノードは、グループの後に接続関係から算出した深さ別に並びます。すべてのノードを明示的なグループへ割り当てると、レイヤー順を直接指定できます。

`sequence` ではグループと `group=ID` を使用できません。

## `node` — 要素と表示オプション

```archmap
node orders "Orders API" description="注文を受け付ける" icon=aws/lambda group=backend at=2,1 shape=card color=blue
```

| 要素・オプション | 必須 | 値 | 既定 |
| --- | --- | --- | --- |
| ID | はい | 一意のノード ID | — |
| ラベル | はい | ダブルクォートで囲む表示名。120 文字まで | — |
| `description` | いいえ | ダブルクォートで囲む説明。240 文字まで | 説明なし |
| `icon` | いいえ | 登録済みアイコンのキー | アイコンなし |
| `group` | いいえ | 宣言済みグループの ID | 所属なし |
| `at` | いいえ | `列,行`。1 から始まる整数 | 自動配置 |
| `shape` | いいえ | `card`、`database`、`decision`、`start`、`end` | `card` |
| `color` | いいえ | `blue`、`green`、`orange`、`purple`、`gray` | `blue` |

ラベルと説明以外の値はダブルクォートで囲みません。`description="..."` を除き `key=value` で記述します。

### 図形

| `shape` | 表示・用途 |
| --- | --- |
| `card` | 標準の角丸カード。画面遷移図では画面を示すヘッダー付き |
| `database` | データベースを示す円筒 |
| `decision` | 判断・分岐を示す菱形 |
| `start` | 開始を示す終端ノード |
| `end` | 終了を示す終端ノード |

`sequence` の参加者は `card` のみ使用できます。明示的な `shape=card` は有効です。`icon` を使用できる図形は `card` と `database` です。`decision`、`start`、`end` に `icon` を指定するとエラーになります。開始、終了、判断を意味するノードでも、業務ルールの自動検証は行いません。分岐の意味は接続ラベルに記述します。

### グリッド位置

```archmap
diagram activity TD
node choose "承認する？" shape=decision at=2,1
node approve "承認" at=1,2 color=green
node reject "差し戻し" at=3,2 color=orange
choose -> approve "はい"
choose -> reject "いいえ"
```

`at=列,行` はピクセル値ではなく、左から右・上から下に増えるグリッドの位置です。各値は 1〜12。同じ位置に 2 個のノードを置くことはできません。この制約はグループをまたいでも共通です。

手動位置と自動配置を混在できます。自動配置は予約済みのセルを避けます。使用されていない列と行は詰めて表示するため、例えば列 1 と列 12 の間に 10 列分の空白が必ず確保されるわけではありません。相対的な列と行の順序を指定する機能です。

`layers` と `sequence` では `at` を使用できません。

### アイコン

`icon=KEY` はローカルの SVG レジストリーから選択します。アイコンキーは英字から始まり、英数字、`_`、`-`、`.`、`:`、`/` を使用できます。80 文字までです。キーは大文字・小文字を区別します。

| 種類 | キーの例 |
| --- | --- |
| 汎用 | `user`、`browser`、`server`、`database`、`cloud`、`queue`、`storage`、`code`、`shield`、`phone`、`globe`、`layers` |
| AWS | `aws/lambda`、`aws/rds` |
| Google Cloud | `gcp/cloud_run`、`gcp/cloud_sql`、`gcp/pub_sub`、`gcp/cloud_storage` |
| Azure | `azure/app_services` |
| 開発ツール・サービス | `github`、`docker`、`postgresql` |

プレイグラウンドのアイコン一覧は、インストール済みレジストリーから取得したキーの完全な一覧です。パーサーはキーの形式を検証します。形式が正しくても未登録のキーは、レンダラーの汎用フォールバックアイコンで表示します。外部 URL からの読み込みや、DSL による生の SVG の埋め込みは行いません。

スタンドアローン API は `registerIcon(key, { viewBox, body })` でアプリ側からアイコンを登録できます。`body` にはアプリが管理する信頼できる SVG の中身を渡します。

## 接続 — 3 種類の矢印

```archmap
client -> api "request"
api --> client "response"
api <-> database "sync"
```

| 構文 | 線 | 矢印 |
| --- | --- | --- |
| `A -> B` | 実線 | A から B |
| `A --> B` | 破線 | A から B |
| `A <-> B` | 実線 | 両端 |

ラベルは省略可能で、指定する場合は 120 文字まで。ノードとの接続、ラベル用の余白、直交経路はレンダラーが決定します。同じノード間に複数の接続を記述できます。自分自身への接続も有効です。双方向の破線、矢印のない線、接続 ID、接続用の追加オプション、手動の経由点は対応していません。

シーケンス図以外では、接続先の位置に合わせて接続面とポートを割り当てます。同じ行・列の接続は直線を優先し、分岐では相手に近い側へポートを並べ、ラベルの幅も考慮して間隔を確保します。判断ノードの左右への分岐と終了ノードへの左右からの合流は、側面のポートを使います。ノードや他のラベルを避けながら、折れ曲がり・交差・長い迂回の少ない候補を選びます。シーケンス図は接続の記述順を時間軸として扱います。

## シーケンス図の意味

```archmap
diagram sequence
title "データを読み込む"
node browser "Browser" icon=browser
node api "API" icon=server
node database "Database" icon=database

browser -> api "GET /orders"
api -> database "SELECT"
database --> api "rows"
api --> browser "200 OK"
```

参加者は `node` 宣言の順に左から右へ配置し、ライフラインを描画します。メッセージは接続を記述した順に上から下へ配置します。接続ラベルは枠なしで送信元側に置き、左から右は左揃え、右から左は右揃えにします。自身へのメッセージは送信元の右側に左揃えで置きます。`-->` は応答などの破線に使用できます。開始・終了時刻や同期・非同期の実行モデルを推論する機能はありません。

`group`、`group=...`、`at=...`、`TD`、`card` 以外の図形を指定するとエラーです。ループ・条件分岐のフラグメント、アクティベーション、注釈文、参加者の自動生成は未対応です。自身へのメッセージと `<->` は使用できます。

## 入力エラーと上限

不明なコマンド、余分なトークン、不明・重複オプション、無効な値、重複 ID、重複位置、未宣言のノードやグループは、行番号付きのエラーになります。未対応の指定を黙って読み飛ばすことはありません。

| 項目 | 上限 |
| --- | --- |
| ソース全体 | 50,000 文字 |
| ノード | 40 個 |
| 接続 | 100 本 |
| グループ | 12 個 |
| タイトル・各ラベル | 120 文字 |
| 各説明 | 240 文字 |
| アイコンキー | 80 文字 |
| 手動位置の列・行 | それぞれ 1〜12 |
| 1 回のパースで返す診断 | 50 件 |

文字数は JavaScript の文字列長（UTF-16 コード単位）で数えます。巨大な入力はブラウザーの応答性を保つために拒否します。図が複雑になったら、責務やユースケースごとに複数の図へ分けてください。

## スタンドアローン API

`@archmap/core/diagrams` は DOM やサーバーを必要とせず、ソースから SVG 文字列を生成します。この新しいエントリーポイントはリポジトリーのビルド成果物で利用できます。既存の npm 公開版に含まれていることを意味するものではありません。

```ts
import { parseDiagram, renderDiagram, registerIcon } from "@archmap/core/diagrams";

registerIcon("custom", {
  viewBox: "0 0 24 24",
  body: '<circle cx="12" cy="12" r="8" fill="currentColor"/>',
});

const model = parseDiagram(`diagram system
node api "API" icon=custom`);

if (model.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
  console.error(model.diagnostics);
} else {
  const result = renderDiagram(model);
  console.warn(result.model.diagnostics.filter((diagnostic) => diagnostic.severity === "warning"));
  console.log(result.svg);
}
```

`parseDiagram(source)` は `kind`、`direction`、`title`、`nodes`、`groups`、`edges`、`diagnostics` を持つ `DiagramModel` を返します。入力の構文エラーでは例外を投げません。診断には 1 から始まる `line`、`severity`、`message` が含まれます。エラーがある場合も解析できた要素を返すため、描画前に診断を確認してください。

`renderDiagram(model)` は `svg`、`model`、`layout`、`durationMs` を返します。複雑な図で領域の重なりや接続とラベルの交差を検出すると、入力モデルを変更せずに `result.model.diagnostics` へ `warning` を追加します。警告は描画後の戻り値で確認してください。任意の密なグラフで交差が一切なくなることを保証するものではありません。

`computeDiagramLayout(model)` では SVG を生成せずに配置と経路を取得できます。`DIAGRAM_SAMPLES` は 5 種類の動作例です。クラウド・サービスアイコンの一括インストールは静的サイト側で行い、軽量のスタンドアローン API にはアイコンアセットを自動で含めません。

## 旧構文から移行する

| 旧構文・機能 | 新しい書き方 |
| --- | --- |
| `graph LR` | `diagram system LR` |
| `Web[Web App]` | `node Web "Web App"` |
| `DB[(Database)]` | `node DB "Database" shape=database` |
| `A -->\|HTTPS\| B` | `A -> B "HTTPS"`。新構文の `-->` は破線 |
| YAML の `provider` と `kind` | `icon=provider/service` |
| 境界、ゾーン、レイヤー | `group` と `group=...` |
| 3D、オーバーレイ、抽象化、複数ビュー | 新しいプレイグラウンドの対象外 |

旧ソースを新しいプレイグラウンドで読み込んだ場合、自動変換せず構文エラーとして通知します。既存の統合向け旧 API は `@archmap/core` に保持しています。
