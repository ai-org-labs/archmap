import type { DiagramSample } from "./types.js";

/** One small, editable example for each supported diagram kind. */
export const DIAGRAM_SAMPLES: DiagramSample[] = [
  {
    id: "system",
    title: "システム構成図",
    subtitle: "サービスとデータの流れを、ひと目で。",
    source: `diagram system LR
title "注文サービスの構成"

group platform "Google Cloud" color=blue
node client "Web アプリ" description="お客様のブラウザー" icon=browser at=1,1
node gateway "API Gateway" description="認証とルーティング" icon=gcp/api_gateway group=platform at=2,1
node api "Orders API" description="注文を受け付ける" icon=gcp/cloud_run group=platform at=3,1
node database "Cloud SQL" description="注文データ" icon=gcp/cloud_sql shape=database color=green group=platform at=3,2
node queue "Pub / Sub" description="注文イベント" icon=gcp/pub_sub color=orange group=platform at=2,2
node worker "Worker" description="非同期処理" icon=gcp/cloud_run group=platform at=2,3
node storage "Cloud Storage" description="領収書を保存" icon=gcp/cloud_storage color=purple group=platform at=3,3

client -> gateway "HTTPS"
gateway -> api "認証済み"
api -> database "読み書き"
api --> queue "注文イベント"
queue -> worker "配信"
worker -> storage "PDF"`,
  },
  {
    id: "layers",
    title: "レイヤースタック図",
    subtitle: "責務を分けて、依存関係を整える。",
    source: `diagram layers TD
title "アプリケーションの 3 層"

group presentation "01 · Presentation" color=blue
group application "02 · Application" color=purple
group persistence "03 · Data" color=green

node web "Web UI" description="ブラウザーからの操作" icon=browser group=presentation
node mobile "Mobile UI" description="モバイルからの操作" icon=phone group=presentation
node api "API" description="入力と権限を検証" icon=server color=purple group=application
node domain "Domain" description="業務ルール" icon=code color=purple group=application
node database "PostgreSQL" description="永続データ" icon=database shape=database color=green group=persistence
node cache "Cache" description="よく使うデータ" icon=storage color=green group=persistence

web -> api
mobile -> api
api -> domain
domain -> database
domain --> cache`,
  },
  {
    id: "sequence",
    title: "シーケンス図",
    subtitle: "やり取りを、時間の順に追いかける。",
    source: `diagram sequence
title "注文が完了するまで"

# 参加者は宣言順、メッセージは記述順
node customer "お客様" icon=user
node web "Web アプリ" icon=browser
node api "Orders API" icon=server
node database "Database" icon=database color=green

customer -> web "注文を確定"
web -> api "POST /orders"
api -> database "注文を保存"
database --> api "注文 ID"
api --> web "201 Created"
web --> customer "完了画面を表示"`,
  },
  {
    id: "screens",
    title: "画面遷移図",
    subtitle: "画面とユーザーの動線をつなぐ。",
    source: `diagram screens LR
title "ショッピングの画面遷移"

node home "ホーム" description="おすすめと新着" icon=browser at=1,1
node detail "商品詳細" description="サイズ・カラーを選択" icon=browser at=2,1
node cart "カート" description="注文内容を確認" icon=browser at=3,1
node checkout "お支払い" description="配送先と決済" icon=shield color=purple at=4,1
node complete "注文完了" description="注文番号を表示" icon=browser color=green at=4,2

home -> detail "商品を選ぶ"
detail -> cart "カートに追加"
cart -> checkout "購入に進む"
checkout -> complete "確定"
cart --> detail "買い物を続ける"`,
  },
  {
    id: "activity",
    title: "アクティビティ図",
    subtitle: "処理と分岐を、迷わず読み進める。",
    source: `diagram activity TD
title "注文の承認フロー"

node start "注文受付" shape=start color=gray at=2,1
node verify "在庫を確認" icon=storage at=2,2
node available "在庫あり？" shape=decision color=orange at=2,3
node reserve "在庫を確保" icon=database color=green at=1,4
node notify "入荷を案内" icon=phone color=purple at=3,4
node finish "処理完了" shape=end color=gray at=2,5

start -> verify
verify -> available
available -> reserve "はい"
available -> notify "いいえ"
reserve -> finish
notify -> finish`,
  },
];
