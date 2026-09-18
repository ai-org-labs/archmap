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
group ID "ラベル" [color=COLOR] [parent=ID]
node ID "ラベル" [description="説明"] [icon=KEY] [group=ID] [at=列,行] [shape=SHAPE] [color=COLOR]
action 画面ID "操作名" [to=ID | state="状態名" | effect="結果" | close=true] [when="実行できる状態"]
ID -> ID ["ラベル"]
ID --> ID ["ラベル"]
ID <-> ID ["ラベル"]
activate ID
deactivate ID
alt "条件"
else ["条件"]
opt "条件"
loop "繰り返し条件"
par "並列処理の名前"
and ["別の並列処理の名前"]
end
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

アイコンの左右と上側に接続し、下側では名前・説明の領域を避けて接続します。グループ、グリッド配置、接続ラベルは共通です。`parent=ID` によるグループの入れ子も使用できます。

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
| `parent` | いいえ | 親グループの ID。省略時はルート |

`system`、`screens`、`activity` では、グループのメンバーを囲む領域として表示します。ノードが直接所属できるグループは 1 つで、その祖先グループにも包含されます。親は子グループの見出しと余白を含めて囲みます。子孫にもノードがないグループは描画されません。手動配置では、兄弟や無関係なグループの領域を重ねないよう位置を指定してください。親子の包含は正常な表示として扱います。

`layers` では、親に直接所属するノード、子グループの順に上から下へ配置します。ルートと兄弟は宣言順、各レイヤーのノードは宣言順に左から右へ並びます。直接所属するノードがない親は行を消費しません。所属なしのノードは、グループの後に接続関係から算出した深さ別に並びます。

`sequence` ではグループと `group=ID` を使用できません。

### グループの入れ子

グループに省略可能な `parent=ID` を指定すると、そのグループを親の内側に配置します。省略時はルートです。

```archmap
diagram system LR
style icons
group cloud "AWS Cloud" color=gray
group region "Tokyo Region" parent=cloud color=blue
group vpc "Production VPC" parent=region color=green
group app_subnet "Application subnet" parent=vpc color=blue
group data_subnet "Database subnet" parent=vpc color=green
node app "Amazon EC2" icon=aws/ec2 group=app_subnet at=1,1
node db "Amazon RDS" icon=aws/rds group=data_subnet at=2,1
app -> db "SQL"
```

親は後から宣言することもできます。未定義の親、ノードを親にする指定、自分自身の指定、循環する親子関係はエラーです。入れ子はルートを 1 段として最大 8 段、グループ総数は 12 個です。色は継承せず、省略時は `blue` です。

自動配置は同じ親の子孫をまとめます。`at` は親からの相対位置ではなく、図全体のグリッド位置です。接続先には引き続きノードを指定します。

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
| `shape` | いいえ | `card`、`database`、`decision`、`start`、`end`、`fork`、`join`、`modal` | `card` |
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
| `fork` | 並列処理へ分岐するバー。`activity` 専用 |
| `join` | すべての入力の完了を待つ合流バー。`activity` 専用 |
| `modal` | 小さなダイアログ枠。`screens` 専用 |

`sequence` の参加者は `card` のみ使用できます。明示的な `shape=card` は有効です。`icon` を使用できる図形は `card`、`database`、`modal` です。それ以外の図形に `icon` を指定するとエラーになります。業務ルールの自動検証は行いません。分岐の意味は接続ラベルに記述します。

### アクティビティの並列分岐・合流

```archmap
diagram activity TD
node start "開始" shape=start at=2,1
node split "並列実行" shape=fork color=gray at=2,2
node stock "在庫を確認" at=1,3
node payment "支払方法を確認" at=3,3
node sync "両方の完了を待つ" shape=join color=gray at=2,4
node finish "次の処理へ" shape=end at=2,5
start -> split
split -> stock
split -> payment
stock -> sync
payment -> sync
sync -> finish
```

`fork` はすべての出力先を並列に開始し、`join` はすべての入力元が完了してから次へ進むことを表します。`decision` の条件分岐とは異なります。`TD` では横向き、`LR` では縦向きのバーになり、名前と説明をバーの外側に配置します。グループへの所属と入れ子、`at`、色の指定も使用できます。並列枝の中に別の fork / join を置くこともできます。

`fork` は異なる入力元が 1 つ、異なる出力先が 2 つ以上必要です。`join` は異なる入力元が 2 つ以上、異なる出力先が 1 つ必要です。同じ相手への接続を繰り返しても枝数には数えません。自己接続と `<->` は使用できません。対応する fork / join の自動補完や、全経路の到達可能性・デッドロックの検証は行いません。

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

`icon=KEY` はローカルの SVG レジストリーから選択します。アイコンキーは英数字から始まり、英数字、`_`、`-`、`.`、`:`、`/` を使用できます。80 文字までです。キーは大文字・小文字を区別します。ノードの ID は引き続き英字または `_` から始めます。

| 種類 | キーの例 |
| --- | --- |
| 汎用 | `user`、`browser`、`server`、`database`、`cloud`、`queue`、`storage`、`code`、`shield`、`phone`、`globe`、`layers` |
| AWS | `aws/lambda`、`aws/rds` |
| Google Cloud | `gcp/cloud_run`、`gcp/cloud_sql`、`gcp/pub_sub`、`gcp/cloud_storage` |
| Azure | `azure/app_services` |
| 開発ツール・サービス | `github`、`gitlab`、`argocd`、`docker`、`postgresql` |
| AI・外部サービス | `openai`、`anthropic`、`stripe`、`1password` |

オンライン版とオフライン版には `@archmap/icons` 0.1.3 の全アイコンを同梱しています。AWS 305、Google Cloud 261、Azure 705、共通サービス 98 種に対応し、パッケージの別名もそのまま `icon=KEY` に使用できます。例えば `icon=onepassword` と `icon=1password` は同じアイコンです。パッケージが文字バッジで提供するサービスは、同じ文字バッジを表示します。

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

シーケンス図以外では、接続先の位置に合わせて接続面とポートを割り当てます。同じ行・列の接続は直線を優先し、分岐では相手に近い側へポートを並べ、ラベルの幅も考慮して間隔を確保します。判断ノードの左右への分岐と終了ノードへの左右からの合流は、側面のポートを使います。ノードや他のラベルを避けながら、折れ曲がり・交差・長い迂回の少ない候補を選びます。シーケンス図は同じ枝内の接続の記述順を時間軸として扱います。

## 画面遷移図のアクション一覧

```archmap
diagram screens LR
node home "ホーム" description="おすすめの商品" icon=browser
node detail "商品詳細" icon=browser
node cart "カート" icon=browser
home -> detail "商品を選ぶ"
home -> cart "カートを見る"
detail -> cart "カートに追加"
cart --> detail "買い物を続ける"
```

`shape=card` の画面と `shape=modal` のモーダルでは、上部に名前と説明、下部にその画面から実行するアクションを表示します。既存の接続から生成したアクションと、`action` で宣言したアクションを、ソースの記述順にまとめて並べます。モーダルは幅の小さい枠と「MODAL」のヘッダーで区別します。

接続ラベルをアクション名として画面内に一度だけ表示し、その行から遷移先の画面ヘッダーへ線を引きます。線上には同じラベルを重複表示しません。長いアクション名は折り返し、行と画面の高さを広げます。ラベルを省略すると「遷移先の画面名へ」を表示します。

既存の自身への接続も使用できますが、画面内状態の変更は `state`、遷移しない操作は `effect` で表すと不要な戻り線を省けます。双方向接続 `<->` は両方の画面に同じラベルのアクションを表示し、その行同士を接続します。行きと帰りの操作名が異なる場合は、2 本の片方向接続で記述してください。アクションのない画面には「アクションの定義なし」と表示します。これはアプリの終了を意味しません。

判断・開始・終了など `card` / `modal` 以外の図形は従来の表示を使います。アクション一覧は設計図の表現であり、画面を操作する実行可能なプロトタイプではありません。

### 独立したアクション・画面内状態・モーダル

```archmap
diagram screens LR
node profile "プロフィール" icon=user at=1,1
node confirm "削除確認" shape=modal color=purple at=2,2
node home "ホーム" at=2,1
action profile "編集する" state="編集中" when="閲覧中"
action profile "保存する" state="閲覧中" when="編集中"
action profile "URL をコピー" effect="クリップボードに保存"
action profile "ダウンロード"
action profile "削除する" to=confirm
action confirm "キャンセル" close=true
action confirm "削除して戻る" to=home
```

| 指定 | 表示・意味 |
| --- | --- |
| `to=ID` | 別画面への矢印。相手が `shape=modal` なら「モーダルを開く」と表示 |
| `state="状態名"` | 同じ画面内の状態変更。行に変更後の状態を表示し、矢印は描かない |
| `effect="結果"` | コピー・保存など遷移しない操作。行に結果を表示し、矢印は描かない |
| `close=true` | モーダルを閉じて呼び出し元に戻る操作。矢印は描かない。モーダル内専用 |
| 上記を省略 | 遷移しない操作の名前だけを宣言 |
| `when="状態名"` | 操作できる状態を補足。上記のいずれとも併用可能 |

`action` は `screens` 専用です。所属先と `to` の宛先は `card` または `modal` のノードを指定し、後方での宣言も可能です。`to` / `state` / `effect` / `close` は同時に指定できません。`to` に自分自身は指定できません。オプションの重複や未知のオプションもエラーです。

操作名・状態・結果・条件はそれぞれ 120 文字以内の空でない文字列です。状態名は画面内での表示上の名前で、別ノードや事前の状態宣言は不要です。初期状態、入力値、保存処理、条件の評価、操作の実行は扱いません。状態が異なるときの操作を同じカード内で比較するための表現です。モーダルは図では独立した枠に配置し、実際の UI の重なり位置を再現するものではありません。

`action` は最大 100 文です。`to` のある操作だけが接続を 1 本生成し、通常の矢印と合わせて接続の上限 100 本に数えます。同じ操作を `action ... to=...` と通常の矢印で重複して記述しないでください。

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

`group`、`group=...`、`at=...`、`TD`、`card` 以外の図形を指定するとエラーです。注釈文と参加者の自動生成は未対応です。自身へのメッセージと `<->` は使用できます。

### 活性区間（アクティベーション）

```archmap
diagram sequence
node web "Web アプリ" icon=browser
node api "API" icon=server
node db "Database" icon=database

web -> api "注文する"
activate api
api -> db "保存する"
activate db
db --> api "保存完了"
deactivate db
api --> web "201 Created"
deactivate api
```

`activate ID` でライフライン上の活性バーを開始し、`deactivate ID` で終了します。`sequence` 専用で、宣言済みの参加者を指定します（ノードの前方参照も可能です）。呼び出しの直後に開始、応答の直後に終了を書くと、受信から応答までの処理区間になります。最初のメッセージより前から開始することもできます。

同じ参加者を再度 `activate` すると入れ子になり、バーを右へずらします。`deactivate` はその参加者の一番内側の区間を閉じます。自己呼び出しの直後に `activate` を置くと、折り返した矢印の到着位置から内側の区間が始まります。矢印は、その時点で有効な最も内側のバーの端に接続します。区間中のメッセージがなくても短いバーを表示します。

開始・終了の順序はソースの記述順です。終了バーには応答矢印の下に少し余白を設けます。実行時間を数値で表すものではありません。指定がなければ活性バーを自動生成しません。未宣言の参加者、開始のない終了、閉じ忘れはエラーです。開始・終了は合計 200 文、入れ子は参加者ごとに 8 段までです。

### 条件分岐・任意処理・繰り返し

```archmap
diagram sequence
node web "Web アプリ"
node api "API"
web -> api "注文する"
activate api
alt "在庫あり"
  loop "注文の商品ごと"
    api -> api "在庫を確保"
  end
  opt "通知が有効"
    api --> web "通知"
  end
  api --> web "201 Created"
else "在庫なし"
  api --> web "409 Conflict"
end
deactivate api
```

| 構文 | 意味 |
| --- | --- |
| `alt "条件"` | 条件分岐の枠を開始 |
| `else "別の条件"` | 現在の `alt` に次の分岐を追加。複数指定可能 |
| `else` | 条件表示を「その他」とする分岐 |
| `opt "条件"` | 条件が成立した場合だけ行う処理の枠を開始 |
| `loop "繰り返し条件"` | 繰り返し処理の枠を開始 |
| `par "並列処理名"` | 並列区間の枠と最初の枝を開始 |
| `and "別の並列処理名"` | 現在の `par` に並列の枝を追加。複数指定可能 |
| `and` | 名前を「並列処理」とする枝を追加 |
| `end` | 最も内側の枠を終了 |

これらは `sequence` 専用です。開始時の条件はダブルクォートで囲み、120 文字以内で指定します。条件や回数は表示用の文字列であり、式を評価したりメッセージを実行・複製したりしません。インデントは任意です。枠はすべての参加者を囲み、入れ子の枠は左右に余白を確保します。長い条件は折り返し、条件とメッセージ用の縦方向の余白を確保します。空の区間も表示できます。

`else` は最も内側に開いている枠が `alt` の場合に使えます。`opt` や `loop` 内で外側の `alt` を切り替えるときは、先に内側の枠を `end` で閉じてください。閉じ忘れ、対応する開始のない `end`、引数付きの `end` はエラーです。フラグメントの文は合計 128 文、入れ子は 4 段までです。

各分岐・フラグメントの中で開始した活性区間は、その区間内で終了してください。外側から継続する活性区間は分岐内で閉じず、枠全体の外で閉じます。これにより、別の分岐に活性区間が残ったり、繰り返しで入れ子の深さが変化したりする記述を防ぎます。

### シーケンスの並列処理

```archmap
diagram sequence
node api "API"
node stock "在庫サービス"
node payment "決済サービス"
activate api
par "在庫確認"
  api -> stock "在庫を確認"
  activate stock
  stock --> api "在庫あり"
  deactivate stock
and "支払方法の確認"
  api -> payment "支払方法を確認"
  activate payment
  payment --> api "利用可能"
  deactivate payment
end
api -> api "両方の結果で判定"
deactivate api
```

`par` の各枝は並列に進み、すべてが完了してから `end` の後へ進むことを表します。読みやすさのため枝を上下に区切りますが、別の枝同士の上下位置は実行順序や所要時間を意味しません。同じ枝内のメッセージは記述順です。

`and` は最も内側の枠が `par` のときだけ使えます。内側の `alt` や `loop` を先に `end` で閉じてから枝を切り替えてください。`par` 内で `else` は使えません。`par` と `alt` / `opt` / `loop` は相互に入れ子にでき、合計 4 段までです。空の枝も表示できます。活性区間はそれぞれの枝内で開始・終了し、外側の活性区間は維持します。

## 入力エラーと上限

不明なコマンド、余分なトークン、不明・重複オプション、無効な値、重複 ID、重複位置、未宣言のノードやグループは、行番号付きのエラーになります。未対応の指定を黙って読み飛ばすことはありません。

| 項目 | 上限 |
| --- | --- |
| ソース全体 | 50,000 文字 |
| ノード | 40 個 |
| 接続 | 100 本 |
| 画面の `action` | 100 文（`to` は接続数にも算入） |
| 活性区間の開始・終了 | 合計 200 文（シーケンス図のみ） |
| 活性区間の入れ子 | 参加者ごとに 8 段 |
| フラグメントの文 | 合計 128 文（シーケンス図のみ） |
| フラグメントの入れ子 | 4 段 |
| グループ | 12 個 |
| グループの入れ子 | 8 段（ルートを含む） |
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

`parseDiagram(source)` は `kind`、`direction`、`title`、`nodes`、`groups`、`edges`、`diagnostics` を持つ `DiagramModel` を返します。活性区間を記述した場合は、`activationEvents` に開始・終了、参加者 ID、直前までの接続数 `afterEdge`、行番号が入ります。条件分岐などは `fragmentEvents` に種類、条件ラベル、`afterEdge`、行番号が入ります。入力の構文エラーでは例外を投げません。診断には 1 から始まる `line`、`severity`、`message` が含まれます。エラーがある場合も解析できた要素を返すため、描画前に診断を確認してください。

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
