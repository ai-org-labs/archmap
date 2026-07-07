export type ArchMapSampleBaseView = "overview" | "layer" | "prototype";
export type ArchMapSampleRenderMode = "2d" | "3d";

export interface ArchMapSampleRecommendation {
  baseView: ArchMapSampleBaseView;
  renderMode: ArchMapSampleRenderMode;
  overlays: string[];
}

export interface ArchMapSample {
  id: string;
  title: string;
  category: string;
  description: string;
  recommendation: ArchMapSampleRecommendation;
  source: string;
}

const source = (value: string): string => value.trim();

export const DEFAULT_ARCHMAP_SAMPLE_ID = "release-checkout";

export const DEFAULT_ARCHMAP_SAMPLES: ArchMapSample[] = [
  {
    id: "release-checkout",
    title: "Checkout release slice",
    category: "Product / screenflow",
    description: "Small checkout system that exercises Overview, Layer, Prototype, and every add-info overlay.",
    recommendation: {
      baseView: "overview",
      renderMode: "2d",
      overlays: ["subgraph", "zone", "auth", "dataflow", "boundary", "permission", "validation"],
    },
    source: source(`
graph LR
  subgraph ShopperJourney
    Home[Home]
    Login[Login]
    Checkout[Checkout]
    Complete[Complete]
  end

  Home -->|start| Login
  Login -->|submit| Checkout
  Checkout -->|place order| APIGW[Order API]
  APIGW -->|write order| OrdersDB[(Orders DB)]
  APIGW -->|open payment| Payment[Payment Provider]
  Payment -->|success| Complete
  FirebaseAuth[Firebase Auth] -->|issues token| Login
  APIGW -->|metrics| Monitor[Ops Monitor]
---
mode: screenflow
title: "Release sample: checkout flow"
description: "Lightweight sample covering Overview, Layer, Prototype, and all Add info overlays."
nodes:
  Home:
    zone: web
    layer: client
    kind: page
    frame: { device: desktop, width: 960, height: 640 }
  Login:
    zone: web
    layer: client
    kind: form
    frame: { device: desktop, width: 960, height: 640 }
  Checkout:
    zone: web
    layer: client
    kind: form
    frame: { device: desktop, width: 960, height: 640 }
  Complete:
    zone: web
    layer: client
    kind: completion_screen
    frame: { device: desktop, width: 960, height: 640 }
  FirebaseAuth:
    zone: identity
    layer: identity
    kind: identity_provider
    provider: firebase
  APIGW:
    zone: backend
    layer: edge
    kind: api_gateway
    provider: gcp
    principal: order-api-sa
  OrdersDB:
    zone: backend
    layer: data
    kind: relational_database
    provider: gcp
  Payment:
    zone: external_payment
    layer: external
    kind: external_page
    provider: stripe
    frame: { device: webview, width: 960, height: 640 }
  Monitor:
    zone: operations
    layer: operations
    kind: monitoring
    provider: datadog
edges:
  Home->Login:
    flow: navigate
    trigger: click
    hotspot: { x: 96, y: 120, width: 320, height: 160 }
  Login->Checkout:
    flow: submit
    trigger: submit
    data: customer_profile
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: APIGW }
    hotspot: { x: 560, y: 440, width: 280, height: 64 }
  Checkout->APIGW:
    flow: submit
    trigger: submit
    data: order_request
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: APIGW }
    boundaryCrossing: true
    hotspot: { x: 560, y: 440, width: 280, height: 64 }
  APIGW->OrdersDB:
    flow: data_access
    trigger: submit
    data: order_request
    principal: order-api-sa
  APIGW->Payment:
    flow: redirect
    trigger: redirect
    data: payment_session
    boundaryCrossing: true
  Payment->Complete:
    flow: success
    trigger: redirect
    data: payment_result
    boundaryCrossing: true
  FirebaseAuth->Login:
    flow: token_issue
    trigger: redirect
    auth: { token: JWT, issuer: FirebaseAuth, recipient: Login }
    boundaryCrossing: true
  APIGW->Monitor:
    flow: telemetry_export
    trigger: auto
    data: ops_event
    boundaryCrossing: true
identities:
  order-api-sa: { kind: service_account, provider: gcp, attachedTo: APIGW }
data:
  customer_profile:
    label: Customer Profile
    classification: personal
    storage: transient
    flows: [Login->Checkout]
  order_request:
    label: Order Request
    classification: confidential
    storage: durable
    storedIn: [OrdersDB]
    flows: [Checkout->APIGW, APIGW->OrdersDB]
  payment_session:
    label: Payment Session
    classification: restricted
    storage: transient
    flows: [APIGW->Payment]
  payment_result:
    label: Payment Result
    classification: restricted
    storage: transient
    flows: [Payment->Complete]
  ops_event:
    label: Operational Event
    classification: internal
    storage: transient
    flows: [APIGW->Monitor]
permissions:
  api_db_writer:
    principal: order-api-sa
    action: write
    resource: OrdersDB
    role: roles/cloudsql.client
zones:
  web:
    label: Web Experience
    kind: client
    contains: [Home, Login, Checkout, Complete]
  identity:
    label: Identity
    kind: identity
    contains: [FirebaseAuth]
  backend:
    label: Backend
    kind: cloud
    contains: [APIGW, OrdersDB]
  external_payment:
    label: External Payment
    kind: partner
    contains: [Payment]
  operations:
    label: Operations
    kind: operations
    contains: [Monitor]
boundaries:
  public_edge:
    label: Public Edge Boundary
    kind: trust_boundary
    contains:
      - zone: web
      - zone: backend
  payment_boundary:
    label: Payment Provider Boundary
    kind: trust_boundary
    contains:
      - zone: external_payment
  operations_boundary:
    label: Operations Boundary
    kind: policy_boundary
    contains:
      - zone: operations
scenarios:
  checkout_happy_path:
    label: Checkout happy path
    start: Home
    steps:
      - Home->Login
      - Login->Checkout
      - Checkout->APIGW
      - APIGW->Payment
      - Payment->Complete
view:
  default:
    base: overview
    overlays: [subgraph, zone, auth, dataflow, boundary, permission, validation]
`),
  },
  {
    id: "saas-control-plane",
    title: "SaaS control plane",
    category: "SaaS architecture",
    description: "Web/admin/API control plane with identity, data, SaaS operations, and permission metadata.",
    recommendation: {
      baseView: "overview",
      renderMode: "2d",
      overlays: ["zone", "auth", "dataflow", "boundary", "permission"],
    },
    source: source(`
graph LR
  User[User] -->|HTTPS + JWT| Web[Web App]
  Admin[Admin User] -->|admin HTTPS| Console[Admin Console]
  Web -->|HTTPS + JWT| APIGW[API Gateway]
  Console -->|admin HTTPS| APIGW
  FirebaseAuth[Firebase Auth] -->|issues JWT| Web
  APIGW -->|validate JWT| FirebaseAuth
  APIGW -->|HTTPS| App[Cloud Run]
  App -->|SQL| CloudSQL[(Cloud SQL)]
  App -->|publish| PubSub[(Pub/Sub Topic)]
  PubSub -->|message| Worker[Batch Worker]
  Worker -->|write| BigQuery[(BigQuery)]
  Wiz[Wiz] -->|scans| App
  App -->|logs| Datadog[Datadog]
---
title: "SaaS control plane"
nodes:
  User: { zone: client, layer: client, kind: user }
  Admin: { zone: client, layer: client, kind: user, principal: admin-user }
  Web: { zone: client, layer: client, kind: web_app }
  Console: { zone: client, layer: client, kind: admin_console, principal: admin-user }
  FirebaseAuth: { zone: identity, layer: identity, kind: identity_provider, provider: firebase }
  APIGW: { zone: gcp_edge, layer: edge, kind: api_gateway, provider: gcp }
  App: { zone: gcp_runtime, layer: runtime, kind: serverless_service, provider: gcp, principal: app-sa }
  CloudSQL: { zone: gcp_data, layer: data, kind: relational_database, provider: gcp }
  PubSub: { zone: gcp_runtime, layer: messaging, kind: topic, provider: gcp }
  Worker: { zone: gcp_runtime, layer: runtime, kind: batch_job, provider: gcp, principal: worker-sa }
  BigQuery: { zone: gcp_data, layer: data, kind: data_warehouse, provider: gcp }
  Wiz: { zone: saas_ops, layer: operations, kind: monitoring, provider: wiz }
  Datadog: { zone: saas_ops, layer: operations, kind: monitoring, provider: datadog }
edges:
  User->Web:
    flow: request
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: APIGW }
  Admin->Console:
    flow: admin_operation
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: APIGW }
  Web->APIGW:
    flow: request
    data: request_context
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: APIGW }
    boundaryCrossing: true
  Console->APIGW:
    flow: admin_operation
    data: admin_action
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: APIGW }
    boundaryCrossing: true
  FirebaseAuth->Web:
    flow: token_issue
    auth: { token: JWT, issuer: FirebaseAuth, recipient: Web }
    boundaryCrossing: true
  APIGW->FirebaseAuth:
    flow: token_validate
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: APIGW }
  APIGW->App:
    flow: request
    data: request_context
  App->CloudSQL:
    flow: data_access
    data: customer_record
    principal: app-sa
  App->PubSub:
    flow: event_publish
    data: job_event
  PubSub->Worker:
    flow: event_subscribe
    data: job_event
  Worker->BigQuery:
    flow: data_write
    data: analytics_event
    principal: worker-sa
  Wiz->App:
    flow: compliance_scan
    boundaryCrossing: true
  App->Datadog:
    flow: telemetry_export
    data: ops_telemetry
    boundaryCrossing: true
identities:
  admin-user: { kind: user, provider: internal, attachedTo: Console }
  app-sa: { kind: service_account, provider: gcp, attachedTo: App }
  worker-sa: { kind: service_account, provider: gcp, attachedTo: Worker }
data:
  request_context: { classification: internal, storage: transient, flows: [Web->APIGW, APIGW->App] }
  admin_action: { classification: confidential, storage: durable, flows: [Console->APIGW] }
  customer_record: { classification: personal, storage: durable, storedIn: [CloudSQL], flows: [App->CloudSQL] }
  job_event: { classification: internal, storage: transient, flows: [App->PubSub, PubSub->Worker] }
  analytics_event: { classification: internal, storage: durable, storedIn: [BigQuery], flows: [Worker->BigQuery] }
  ops_telemetry: { classification: internal, storage: transient, flows: [App->Datadog] }
permissions:
  app_sql: { principal: app-sa, action: connect, resource: CloudSQL, role: roles/cloudsql.client }
  worker_bq: { principal: worker-sa, action: write, resource: BigQuery, role: roles/bigquery.dataEditor }
zones:
  client: { label: Client, kind: client, contains: [User, Admin, Web, Console] }
  identity: { label: Identity, kind: identity, contains: [FirebaseAuth] }
  gcp_edge: { label: GCP Edge, kind: cloud, provider: gcp, contains: [APIGW] }
  gcp_runtime: { label: GCP Runtime, kind: cloud, provider: gcp, contains: [App, PubSub, Worker] }
  gcp_data: { label: GCP Data, kind: cloud, provider: gcp, contains: [CloudSQL, BigQuery] }
  saas_ops: { label: SaaS Ops, kind: saas, contains: [Wiz, Datadog] }
boundaries:
  product_boundary:
    label: Product Boundary
    kind: trust_boundary
    contains:
      - zone: client
      - zone: gcp_edge
      - zone: gcp_runtime
      - zone: gcp_data
  external_ops:
    label: External Operations Boundary
    kind: policy_boundary
    contains:
      - zone: saas_ops
view:
  default:
    base: overview
    overlays: [zone, auth, dataflow, boundary, permission]
`),
  },
  {
    id: "cloud-data-platform",
    title: "Analytics data platform",
    category: "Data platform",
    description: "Batch and streaming analytics stack. Best viewed as a Layer map with dataflow and permission overlays.",
    recommendation: {
      baseView: "layer",
      renderMode: "2d",
      overlays: ["zone", "dataflow", "permission", "boundary"],
    },
    source: source(`
graph LR
  App[Application] -->|events| Topic[(Pub/Sub)]
  Partner[Partner Feed] -->|SFTP| Landing[(Cloud Storage Landing)]
  Topic -->|stream| Dataflow[Dataflow]
  Landing -->|batch| Dataflow
  Dataflow -->|curated| BigQuery[(BigQuery)]
  Scheduler[Cloud Scheduler] -->|daily trigger| Dataflow
  BigQuery -->|BI query| Looker[BI Dashboard]
  BigQuery -->|export| Archive[(Archive Bucket)]
  Dataflow -->|metrics| Monitoring[Cloud Monitoring]
---
title: "Analytics data platform"
nodes:
  App: { zone: product, layer: client, kind: web_app }
  Partner: { zone: partner, layer: external, kind: external_page }
  Topic: { zone: ingestion, layer: messaging, kind: topic, provider: gcp }
  Landing: { zone: ingestion, layer: data, kind: object_storage, provider: gcp }
  Scheduler: { zone: orchestration, layer: operations, kind: workflow, provider: gcp, principal: scheduler-sa }
  Dataflow: { zone: processing, layer: runtime, kind: workflow, provider: gcp, principal: dataflow-sa }
  BigQuery: { zone: warehouse, layer: data, kind: data_warehouse, provider: gcp }
  Looker: { zone: consumers, layer: client, kind: web_app, provider: gcp }
  Archive: { zone: warehouse, layer: data, kind: object_storage, provider: gcp }
  Monitoring: { zone: operations, layer: operations, kind: monitoring, provider: gcp }
edges:
  App->Topic: { flow: event_publish, data: product_event }
  Partner->Landing: { flow: batch, data: partner_file, boundaryCrossing: true }
  Topic->Dataflow: { flow: event_subscribe, data: product_event }
  Landing->Dataflow: { flow: data_read, data: partner_file, principal: dataflow-sa }
  Scheduler->Dataflow: { flow: admin_operation, principal: scheduler-sa }
  Dataflow->BigQuery: { flow: data_write, data: curated_fact, principal: dataflow-sa }
  BigQuery->Looker: { flow: data_read, data: dashboard_dataset }
  BigQuery->Archive: { flow: replication, data: curated_fact, principal: dataflow-sa }
  Dataflow->Monitoring: { flow: telemetry_export, data: pipeline_metric }
identities:
  dataflow-sa: { kind: service_account, provider: gcp, attachedTo: Dataflow }
  scheduler-sa: { kind: service_account, provider: gcp, attachedTo: Scheduler }
data:
  product_event: { classification: internal, storage: transient, flows: [App->Topic, Topic->Dataflow] }
  partner_file: { classification: confidential, storage: durable, storedIn: [Landing], flows: [Partner->Landing, Landing->Dataflow] }
  curated_fact: { classification: confidential, storage: durable, storedIn: [BigQuery, Archive], flows: [Dataflow->BigQuery, BigQuery->Archive] }
  dashboard_dataset: { classification: internal, storage: transient, flows: [BigQuery->Looker] }
  pipeline_metric: { classification: internal, storage: transient, flows: [Dataflow->Monitoring] }
permissions:
  dataflow_landing_reader: { principal: dataflow-sa, action: read, resource: Landing, role: roles/storage.objectViewer }
  dataflow_bq_writer: { principal: dataflow-sa, action: write, resource: BigQuery, role: roles/bigquery.dataEditor }
  scheduler_invoker: { principal: scheduler-sa, action: invoke, resource: Dataflow, role: roles/dataflow.developer }
zones:
  product: { label: Product Systems, kind: project, contains: [App] }
  partner: { label: External Partner, kind: partner, contains: [Partner] }
  ingestion: { label: Ingestion, kind: project, contains: [Topic, Landing] }
  orchestration: { label: Orchestration, kind: project, contains: [Scheduler] }
  processing: { label: Processing, kind: project, contains: [Dataflow] }
  warehouse: { label: Warehouse, kind: project, contains: [BigQuery, Archive] }
  consumers: { label: Consumers, kind: project, contains: [Looker] }
  operations: { label: Operations, kind: operations, contains: [Monitoring] }
boundaries:
  partner_boundary:
    label: Partner Boundary
    kind: trust_boundary
    contains:
      - zone: partner
view:
  default:
    base: layer
    overlays: [zone, dataflow, permission, boundary]
`),
  },
  {
    id: "multiregion-resilience",
    title: "Multi-region resilience",
    category: "Reliability design",
    description: "Global edge, active-active services, replicated data, and operations telemetry.",
    recommendation: {
      baseView: "overview",
      renderMode: "3d",
      overlays: ["zone", "boundary", "dataflow"],
    },
    source: source(`
graph LR
  User[External User] -->|HTTPS| DNS[Cloud DNS]
  DNS -->|route| WAF[Cloud Armor WAF]
  WAF -->|HTTPS| LB[Global Load Balancer]
  LB -->|primary| ServiceUS[Service us-central1]
  LB -->|secondary| ServiceEU[Service europe-west1]
  ServiceUS -->|SQL| DBUS[(Primary DB)]
  ServiceEU -->|SQL| DBEU[(Replica DB)]
  DBUS -->|replicate| DBEU
  ServiceUS -->|logs| Ops[Operations]
  ServiceEU -->|logs| Ops
  Ops -->|alert| OnCall[On-call]
---
title: "Multi-region resilience"
nodes:
  User: { zone: internet, layer: client, kind: external_user }
  DNS: { zone: edge, layer: edge, kind: dns, provider: gcp }
  WAF: { zone: edge, layer: edge, kind: waf, provider: gcp }
  LB: { zone: edge, layer: edge, kind: load_balancer, provider: gcp }
  ServiceUS: { zone: us_region, layer: runtime, kind: serverless_service, provider: gcp, principal: service-us-sa }
  ServiceEU: { zone: eu_region, layer: runtime, kind: serverless_service, provider: gcp, principal: service-eu-sa }
  DBUS: { zone: us_region, layer: data, kind: relational_database, provider: gcp }
  DBEU: { zone: eu_region, layer: data, kind: relational_database, provider: gcp }
  Ops: { zone: operations, layer: operations, kind: monitoring, provider: gcp }
  OnCall: { zone: operations, layer: operations, kind: user }
edges:
  User->DNS: { flow: request, data: request_context, boundaryCrossing: true }
  DNS->WAF: { flow: network_route, data: request_context }
  WAF->LB: { flow: request, data: request_context }
  LB->ServiceUS: { flow: request, data: request_context }
  LB->ServiceEU: { flow: request, data: request_context }
  ServiceUS->DBUS: { flow: data_access, data: account_state, principal: service-us-sa }
  ServiceEU->DBEU: { flow: data_access, data: account_state, principal: service-eu-sa }
  DBUS->DBEU: { flow: replication, data: account_state, boundaryCrossing: true }
  ServiceUS->Ops: { flow: telemetry_export, data: service_metric }
  ServiceEU->Ops: { flow: telemetry_export, data: service_metric }
  Ops->OnCall: { flow: message_send, data: incident_signal }
identities:
  service-us-sa: { kind: service_account, provider: gcp, attachedTo: ServiceUS }
  service-eu-sa: { kind: service_account, provider: gcp, attachedTo: ServiceEU }
data:
  request_context: { classification: internal, storage: transient, flows: [User->DNS, DNS->WAF, WAF->LB, LB->ServiceUS, LB->ServiceEU] }
  account_state: { classification: confidential, storage: durable, storedIn: [DBUS, DBEU], flows: [ServiceUS->DBUS, ServiceEU->DBEU, DBUS->DBEU] }
  service_metric: { classification: internal, storage: transient, flows: [ServiceUS->Ops, ServiceEU->Ops] }
  incident_signal: { classification: internal, storage: transient, flows: [Ops->OnCall] }
permissions:
  us_db_access: { principal: service-us-sa, action: connect, resource: DBUS, role: roles/cloudsql.client }
  eu_db_access: { principal: service-eu-sa, action: connect, resource: DBEU, role: roles/cloudsql.client }
zones:
  internet: { label: Internet, kind: internet, contains: [User] }
  edge: { label: Global Edge, kind: cloud, contains: [DNS, WAF, LB] }
  us_region: { label: us-central1, kind: region, contains: [ServiceUS, DBUS] }
  eu_region: { label: europe-west1, kind: region, contains: [ServiceEU, DBEU] }
  operations: { label: Operations, kind: operations, contains: [Ops, OnCall] }
boundaries:
  public_edge: { label: Public Edge, kind: trust_boundary, contains: [zone: internet, zone: edge] }
  regional_boundary: { label: Cross-region Boundary, kind: region_boundary, contains: [zone: us_region, zone: eu_region] }
view:
  default:
    base: overview
    overlays: [zone, boundary, dataflow]
`),
  },
  {
    id: "android-platform-stack",
    title: "Android platform stack",
    category: "Mobile / embedded",
    description: "Android application, framework, native libraries, kernel, and Bluetooth device stack.",
    recommendation: {
      baseView: "layer",
      renderMode: "2d",
      overlays: ["zone", "boundary", "dataflow", "permission"],
    },
    source: source(`
graph TB
  App[Phone App] -->|binder call| Telephony[Telephony Manager]
  Telephony -->|RIL request| RIL[Radio Interface Layer]
  RIL -->|native socket| RadioDaemon[Radio Daemon]
  RadioDaemon -->|vendor IPC| VendorRIL[Vendor RIL]
  VendorRIL -->|packet service| KernelIP[Linux IP Stack]
  KernelIP -->|driver call| ModemDriver[Packet Driver]
  ModemDriver -->|baseband command| Baseband[Baseband Modem]
  App -->|Bluetooth API| Bluetooth[Bluetooth Framework]
  Bluetooth -->|HCI| BluetoothDriver[Bluetooth Driver]
  BluetoothDriver -->|radio link| Device[BT Device]
---
title: "Android platform stack"
nodes:
  App: { zone: handset, layer: client, kind: android_app, principal: app-uid }
  Telephony: { zone: handset, layer: runtime, kind: mobile_app }
  Bluetooth: { zone: handset, layer: runtime, kind: mobile_app }
  RIL: { zone: handset, layer: runtime, kind: legacy_api }
  RadioDaemon: { zone: handset, layer: runtime, kind: runtime_service, principal: radio-daemon }
  VendorRIL: { zone: handset, layer: runtime, kind: legacy_api }
  KernelIP: { zone: kernel, layer: network, kind: network_boundary }
  ModemDriver: { zone: kernel, layer: network, kind: legacy_api }
  BluetoothDriver: { zone: kernel, layer: network, kind: legacy_api }
  Baseband: { zone: baseband, layer: external, kind: external_page }
  Device: { zone: peripherals, layer: external, kind: external_page }
edges:
  App->Telephony: { flow: request, data: call_control, principal: app-uid }
  Telephony->RIL: { flow: request, data: call_control }
  RIL->RadioDaemon: { flow: request, data: radio_command }
  RadioDaemon->VendorRIL: { flow: request, data: radio_command, principal: radio-daemon }
  VendorRIL->KernelIP: { flow: network_route, data: packet_service, boundaryCrossing: true }
  KernelIP->ModemDriver: { flow: request, data: packet_service }
  ModemDriver->Baseband: { flow: request, data: modem_command, boundaryCrossing: true }
  App->Bluetooth: { flow: request, data: bluetooth_command, principal: app-uid }
  Bluetooth->BluetoothDriver: { flow: request, data: bluetooth_command, boundaryCrossing: true }
  BluetoothDriver->Device: { flow: request, data: radio_packet, boundaryCrossing: true }
identities:
  app-uid: { kind: service_account, provider: android, attachedTo: App }
  radio-daemon: { kind: service_account, provider: android, attachedTo: RadioDaemon }
data:
  call_control: { classification: personal, storage: transient, flows: [App->Telephony, Telephony->RIL] }
  radio_command: { classification: confidential, storage: transient, flows: [RIL->RadioDaemon, RadioDaemon->VendorRIL] }
  packet_service: { classification: confidential, storage: transient, flows: [VendorRIL->KernelIP, KernelIP->ModemDriver] }
  modem_command: { classification: restricted, storage: transient, flows: [ModemDriver->Baseband] }
  bluetooth_command: { classification: personal, storage: transient, flows: [App->Bluetooth, Bluetooth->BluetoothDriver] }
  radio_packet: { classification: personal, storage: transient, flows: [BluetoothDriver->Device] }
permissions:
  app_bluetooth: { principal: app-uid, action: use, resource: Bluetooth, role: android.permission.BLUETOOTH_CONNECT }
  radio_daemon_vendor: { principal: radio-daemon, action: access, resource: VendorRIL, role: radio.uid }
zones:
  handset: { label: Android User Space, kind: client, contains: [App, Telephony, Bluetooth, RIL, RadioDaemon, VendorRIL] }
  kernel: { label: Linux Kernel, kind: network, contains: [KernelIP, ModemDriver, BluetoothDriver] }
  baseband: { label: Baseband, kind: network, contains: [Baseband] }
  peripherals: { label: External Devices, kind: partner, contains: [Device] }
boundaries:
  kernel_boundary: { label: Kernel Boundary, kind: trust_boundary, contains: [zone: kernel] }
  hardware_boundary: { label: Hardware Boundary, kind: network_boundary, contains: [zone: baseband, zone: peripherals] }
view:
  default:
    base: layer
    overlays: [zone, boundary, dataflow, permission]
`),
  },
  {
    id: "cicd-supply-chain",
    title: "CI/CD supply chain",
    category: "DevOps / delivery",
    description: "Repository, build, artifact, scan, deploy, and runtime identity path.",
    recommendation: {
      baseView: "overview",
      renderMode: "2d",
      overlays: ["zone", "dataflow", "permission", "validation", "boundary"],
    },
    source: source(`
graph LR
  Dev[Developer] -->|push| GitHub[GitHub]
  GitHub -->|webhook| CI[CI Pipeline]
  CI -->|build image| Build[Cloud Build]
  Build -->|push image| Registry[Artifact Registry]
  Registry -->|scan image| Scanner[Security Scanner]
  CI -->|deploy| Deploy[Cloud Deploy]
  Deploy -->|rollout| Service[Cloud Run Service]
  Service -->|pull image| Registry
  Service -->|secrets| Secrets[Secret Manager]
  Service -->|logs| Logging[Cloud Logging]
---
title: "CI/CD supply chain"
nodes:
  Dev: { zone: engineering, layer: client, kind: user }
  GitHub: { zone: vcs, layer: external, kind: repository, provider: github }
  CI: { zone: delivery, layer: operations, kind: ci_cd, principal: ci-sa }
  Build: { zone: delivery, layer: runtime, kind: workflow, provider: gcp, principal: build-sa }
  Registry: { zone: artifacts, layer: data, kind: artifact_registry, provider: gcp }
  Scanner: { zone: security, layer: operations, kind: workflow, provider: gcp }
  Deploy: { zone: delivery, layer: runtime, kind: workflow, provider: gcp, principal: deploy-sa }
  Service: { zone: runtime, layer: runtime, kind: serverless_service, provider: gcp, principal: runtime-sa }
  Secrets: { zone: runtime, layer: data, kind: secret, provider: gcp }
  Logging: { zone: operations, layer: operations, kind: logging, provider: gcp }
edges:
  Dev->GitHub: { flow: deployment, data: source_change, boundaryCrossing: true }
  GitHub->CI: { flow: deployment, data: build_metadata, boundaryCrossing: true }
  CI->Build: { flow: deployment, data: build_metadata, principal: ci-sa }
  Build->Registry: { flow: data_write, data: container_image, principal: build-sa }
  Registry->Scanner: { flow: security_scan, data: container_image }
  CI->Deploy: { flow: deployment, data: release_candidate, principal: ci-sa }
  Deploy->Service: { flow: deployment, data: release_candidate, principal: deploy-sa }
  Service->Registry: { flow: data_read, data: container_image, principal: runtime-sa }
  Service->Secrets: { flow: data_read, data: secret_material, principal: runtime-sa }
  Service->Logging: { flow: logging, data: runtime_log }
identities:
  ci-sa: { kind: service_account, provider: gcp, attachedTo: CI }
  build-sa: { kind: service_account, provider: gcp, attachedTo: Build }
  deploy-sa: { kind: service_account, provider: gcp, attachedTo: Deploy }
  runtime-sa: { kind: service_account, provider: gcp, attachedTo: Service }
data:
  source_change: { classification: internal, storage: durable, flows: [Dev->GitHub] }
  build_metadata: { classification: internal, storage: transient, flows: [GitHub->CI, CI->Build] }
  container_image: { classification: internal, storage: durable, storedIn: [Registry], flows: [Build->Registry, Registry->Scanner, Service->Registry] }
  release_candidate: { classification: internal, storage: transient, flows: [CI->Deploy, Deploy->Service] }
  secret_material: { classification: restricted, storage: durable, storedIn: [Secrets], flows: [Service->Secrets] }
  runtime_log: { classification: internal, storage: transient, flows: [Service->Logging] }
permissions:
  ci_build: { principal: ci-sa, action: invoke, resource: Build, role: roles/cloudbuild.builds.editor }
  build_push: { principal: build-sa, action: write, resource: Registry, role: roles/artifactregistry.writer }
  deploy_rollout: { principal: deploy-sa, action: deploy, resource: Service, role: roles/run.developer }
  runtime_secret: { principal: runtime-sa, action: read, resource: Secrets, role: roles/secretmanager.secretAccessor }
zones:
  engineering: { label: Engineering, kind: client, contains: [Dev] }
  vcs: { label: Source Control, kind: saas, contains: [GitHub] }
  delivery: { label: Delivery Project, kind: project, contains: [CI, Build, Deploy] }
  artifacts: { label: Artifacts, kind: project, contains: [Registry] }
  security: { label: Security, kind: operations, contains: [Scanner] }
  runtime: { label: Runtime, kind: project, contains: [Service, Secrets] }
  operations: { label: Operations, kind: operations, contains: [Logging] }
boundaries:
  external_vcs: { label: External VCS Boundary, kind: trust_boundary, contains: [zone: vcs] }
  runtime_policy: { label: Runtime Policy Boundary, kind: policy_boundary, contains: [zone: runtime] }
view:
  default:
    base: overview
    overlays: [zone, dataflow, permission, validation, boundary]
`),
  },
  {
    id: "iot-edge-telemetry",
    title: "IoT edge telemetry",
    category: "IoT / operations",
    description: "Device telemetry through edge gateway, MQTT, stream processing, alerts, and dashboarding.",
    recommendation: {
      baseView: "overview",
      renderMode: "3d",
      overlays: ["zone", "dataflow", "boundary"],
    },
    source: source(`
graph LR
  Sensor[Sensor Fleet] -->|MQTT| EdgeGW[Edge Gateway]
  EdgeGW -->|publish| MQTT[(MQTT Topic)]
  MQTT -->|stream| Function[Stream Function]
  Function -->|write| TSDB[(Time Series DB)]
  Function -->|alert| Alerting[Alerting]
  TSDB -->|query| Dashboard[Ops Dashboard]
  Alerting -->|notify| OnCall[On-call]
  EdgeGW -->|health| Monitoring[Monitoring]
---
title: "IoT edge telemetry"
nodes:
  Sensor: { zone: field, layer: external, kind: external_page }
  EdgeGW: { zone: edge_site, layer: edge, kind: reverse_proxy, principal: edge-device }
  MQTT: { zone: cloud_ingest, layer: messaging, kind: topic, provider: gcp }
  Function: { zone: cloud_processing, layer: runtime, kind: function, provider: gcp, principal: function-sa }
  TSDB: { zone: cloud_data, layer: data, kind: nosql_database, provider: gcp }
  Alerting: { zone: operations, layer: operations, kind: alerting, provider: gcp }
  Dashboard: { zone: operations, layer: operations, kind: web_app }
  OnCall: { zone: operations, layer: operations, kind: user }
  Monitoring: { zone: operations, layer: operations, kind: monitoring, provider: gcp }
edges:
  Sensor->EdgeGW: { flow: request, data: raw_signal, boundaryCrossing: true }
  EdgeGW->MQTT: { flow: event_publish, data: telemetry_event, principal: edge-device, boundaryCrossing: true }
  MQTT->Function: { flow: event_subscribe, data: telemetry_event }
  Function->TSDB: { flow: data_write, data: normalized_metric, principal: function-sa }
  Function->Alerting: { flow: event_publish, data: alert_event }
  TSDB->Dashboard: { flow: data_read, data: normalized_metric }
  Alerting->OnCall: { flow: message_send, data: alert_event }
  EdgeGW->Monitoring: { flow: telemetry_export, data: gateway_health, boundaryCrossing: true }
identities:
  edge-device: { kind: service_account, provider: internal, attachedTo: EdgeGW }
  function-sa: { kind: service_account, provider: gcp, attachedTo: Function }
data:
  raw_signal: { classification: internal, storage: transient, flows: [Sensor->EdgeGW] }
  telemetry_event: { classification: internal, storage: transient, flows: [EdgeGW->MQTT, MQTT->Function] }
  normalized_metric: { classification: internal, storage: durable, storedIn: [TSDB], flows: [Function->TSDB, TSDB->Dashboard] }
  alert_event: { classification: internal, storage: transient, flows: [Function->Alerting, Alerting->OnCall] }
  gateway_health: { classification: internal, storage: transient, flows: [EdgeGW->Monitoring] }
permissions:
  edge_publish: { principal: edge-device, action: publish, resource: MQTT, role: mqtt.publisher }
  function_write: { principal: function-sa, action: write, resource: TSDB, role: db.writer }
zones:
  field: { label: Field Devices, kind: partner, contains: [Sensor] }
  edge_site: { label: Edge Site, kind: onprem, contains: [EdgeGW] }
  cloud_ingest: { label: Cloud Ingest, kind: cloud, contains: [MQTT] }
  cloud_processing: { label: Cloud Processing, kind: cloud, contains: [Function] }
  cloud_data: { label: Cloud Data, kind: cloud, contains: [TSDB] }
  operations: { label: Operations, kind: operations, contains: [Alerting, Dashboard, OnCall, Monitoring] }
boundaries:
  field_boundary: { label: Field Boundary, kind: network_boundary, contains: [zone: field, zone: edge_site] }
view:
  default:
    base: overview
    overlays: [zone, dataflow, boundary]
`),
  },
  {
    id: "zero-trust-auth",
    title: "Zero-trust auth path",
    category: "Security design",
    description: "Identity provider, gateway validation, policy decision, IAM, secret access, and audit trail.",
    recommendation: {
      baseView: "overview",
      renderMode: "2d",
      overlays: ["zone", "auth", "permission", "boundary", "validation"],
    },
    source: source(`
graph LR
  User[User] -->|sign in| IdP[External IdP]
  IdP -->|issues token| Browser[Browser App]
  Browser -->|HTTPS + JWT| Gateway[API Gateway]
  Gateway -->|validate JWT| IdP
  Gateway -->|policy input| PDP{Policy Decision}
  PDP -->|allow| Service[Service]
  Service -->|read secret| Secrets[Secret Manager]
  Service -->|audit| AuditLog[Audit Log]
---
title: "Zero-trust auth path"
nodes:
  User: { zone: client, layer: client, kind: user }
  Browser: { zone: client, layer: client, kind: web_app }
  IdP: { zone: external_identity, layer: identity, kind: oauth_provider, provider: external }
  Gateway: { zone: edge, layer: edge, kind: api_gateway, provider: gcp }
  PDP: { zone: security, layer: operations, kind: decision }
  Service: { zone: runtime, layer: runtime, kind: serverless_service, provider: gcp, principal: service-sa }
  Secrets: { zone: runtime, layer: data, kind: secret, provider: gcp }
  AuditLog: { zone: operations, layer: operations, kind: logging, provider: gcp }
edges:
  User->IdP: { flow: auth_check, data: login_request, boundaryCrossing: true }
  IdP->Browser:
    flow: token_issue
    auth: { token: JWT, issuer: IdP, recipient: Browser }
    boundaryCrossing: true
  Browser->Gateway:
    flow: request
    data: api_request
    auth: { token: JWT, issuer: IdP, validatedBy: Gateway }
    boundaryCrossing: true
  Gateway->IdP:
    flow: token_validate
    auth: { token: JWT, issuer: IdP, validatedBy: Gateway }
    boundaryCrossing: true
  Gateway->PDP:
    flow: auth_check
    data: policy_context
    auth: { token: JWT, issuer: IdP, validatedBy: Gateway }
  PDP->Service: { flow: request, data: api_request }
  Service->Secrets: { flow: data_read, data: secret_material, principal: service-sa }
  Service->AuditLog: { flow: logging, data: audit_event }
identities:
  service-sa: { kind: service_account, provider: gcp, attachedTo: Service }
data:
  login_request: { classification: personal, storage: transient, flows: [User->IdP] }
  api_request: { classification: confidential, storage: transient, flows: [Browser->Gateway, PDP->Service] }
  policy_context: { classification: confidential, storage: transient, flows: [Gateway->PDP] }
  secret_material: { classification: restricted, storage: durable, storedIn: [Secrets], flows: [Service->Secrets] }
  audit_event: { classification: internal, storage: durable, storedIn: [AuditLog], flows: [Service->AuditLog] }
permissions:
  service_secret: { principal: service-sa, action: read, resource: Secrets, role: roles/secretmanager.secretAccessor }
zones:
  client: { label: Client, kind: client, contains: [User, Browser] }
  external_identity: { label: External Identity, kind: identity, contains: [IdP] }
  edge: { label: Edge, kind: cloud, contains: [Gateway] }
  security: { label: Security Policy, kind: operations, contains: [PDP] }
  runtime: { label: Runtime, kind: cloud, contains: [Service, Secrets] }
  operations: { label: Audit Operations, kind: operations, contains: [AuditLog] }
boundaries:
  external_auth: { label: External Auth Boundary, kind: trust_boundary, contains: [zone: external_identity] }
  runtime_policy: { label: Runtime Policy Boundary, kind: policy_boundary, contains: [zone: runtime] }
view:
  default:
    base: overview
    overlays: [zone, auth, permission, boundary, validation]
`),
  },
  {
    id: "incident-response",
    title: "Incident response workflow",
    category: "Operations planning",
    description: "Monitoring, alert routing, runbook automation, ticketing, rollback, and postmortem evidence.",
    recommendation: {
      baseView: "layer",
      renderMode: "2d",
      overlays: ["zone", "dataflow", "boundary", "validation"],
    },
    source: source(`
graph LR
  Service[Production Service] -->|metrics| Metrics[Metrics]
  Service -->|logs| Logs[Logs]
  Metrics -->|alert| Alerting[Alerting]
  Logs -->|signal| Alerting
  Alerting -->|page| OnCall[On-call Engineer]
  Alerting -->|open ticket| Ticket[Incident Ticket]
  OnCall -->|start runbook| Runbook[Runbook Automation]
  Runbook -->|rollback| Deploy[Deploy System]
  Runbook -->|collect evidence| Evidence[(Evidence Store)]
  Ticket -->|postmortem| Postmortem[Postmortem]
---
title: "Incident response workflow"
nodes:
  Service: { zone: production, layer: runtime, kind: serverless_service, provider: gcp, principal: runtime-sa }
  Metrics: { zone: observability, layer: operations, kind: monitoring, provider: gcp }
  Logs: { zone: observability, layer: operations, kind: logging, provider: gcp }
  Alerting: { zone: operations, layer: operations, kind: alerting, provider: gcp }
  OnCall: { zone: operations, layer: operations, kind: user }
  Ticket: { zone: operations, layer: operations, kind: workflow }
  Runbook: { zone: automation, layer: operations, kind: workflow, principal: runbook-sa }
  Deploy: { zone: delivery, layer: operations, kind: ci_cd, principal: deploy-sa }
  Evidence: { zone: audit, layer: data, kind: object_storage, provider: gcp }
  Postmortem: { zone: operations, layer: operations, kind: web_app }
edges:
  Service->Metrics: { flow: metrics_export, data: metric_signal }
  Service->Logs: { flow: log_export, data: log_signal }
  Metrics->Alerting: { flow: message_send, data: alert_signal }
  Logs->Alerting: { flow: message_send, data: alert_signal }
  Alerting->OnCall: { flow: message_send, data: page_message, boundaryCrossing: true }
  Alerting->Ticket: { flow: event_publish, data: incident_ticket }
  OnCall->Runbook: { flow: admin_operation, data: runbook_request, boundaryCrossing: true }
  Runbook->Deploy: { flow: deployment, data: rollback_plan, principal: runbook-sa }
  Runbook->Evidence: { flow: data_write, data: incident_evidence, principal: runbook-sa }
  Ticket->Postmortem: { flow: data_write, data: incident_ticket }
identities:
  runtime-sa: { kind: service_account, provider: gcp, attachedTo: Service }
  runbook-sa: { kind: service_account, provider: gcp, attachedTo: Runbook }
  deploy-sa: { kind: service_account, provider: gcp, attachedTo: Deploy }
data:
  metric_signal: { classification: internal, storage: transient, flows: [Service->Metrics] }
  log_signal: { classification: internal, storage: durable, storedIn: [Logs], flows: [Service->Logs] }
  alert_signal: { classification: internal, storage: transient, flows: [Metrics->Alerting, Logs->Alerting] }
  page_message: { classification: internal, storage: transient, flows: [Alerting->OnCall] }
  incident_ticket: { classification: internal, storage: durable, storedIn: [Ticket], flows: [Alerting->Ticket, Ticket->Postmortem] }
  runbook_request: { classification: confidential, storage: transient, flows: [OnCall->Runbook] }
  rollback_plan: { classification: confidential, storage: transient, flows: [Runbook->Deploy] }
  incident_evidence: { classification: confidential, storage: durable, storedIn: [Evidence], flows: [Runbook->Evidence] }
permissions:
  runbook_deploy: { principal: runbook-sa, action: rollback, resource: Deploy, role: roles/clouddeploy.operator }
  runbook_evidence: { principal: runbook-sa, action: write, resource: Evidence, role: roles/storage.objectCreator }
zones:
  production: { label: Production, kind: project, contains: [Service] }
  observability: { label: Observability, kind: operations, contains: [Metrics, Logs] }
  operations: { label: Incident Ops, kind: operations, contains: [Alerting, OnCall, Ticket, Postmortem] }
  automation: { label: Automation, kind: operations, contains: [Runbook] }
  delivery: { label: Delivery, kind: project, contains: [Deploy] }
  audit: { label: Audit Evidence, kind: project, contains: [Evidence] }
boundaries:
  human_boundary: { label: Human Response Boundary, kind: policy_boundary, contains: [zone: operations] }
view:
  default:
    base: layer
    overlays: [zone, dataflow, boundary, validation]
`),
  },
  {
    id: "screenflow-onboarding",
    title: "Onboarding prototype",
    category: "UX prototype",
    description: "Prototype view sample with scenarios, hotspots, auth, boundary, and dataflow metadata.",
    recommendation: {
      baseView: "prototype",
      renderMode: "2d",
      overlays: ["auth", "dataflow", "boundary", "validation"],
    },
    source: source(`
graph LR
  Welcome[Welcome] -->|start| Signup[Sign Up]
  Signup -->|submit| Verify[Email Verify]
  Verify -->|success| Profile[Profile Setup]
  Profile -->|continue| Consent[Consent WebView]
  Consent -->|redirect| Dashboard[Dashboard]
  Signup -->|error| ErrorScreen[Error]
---
mode: screenflow
title: "Onboarding prototype"
nodes:
  Welcome: { zone: app, layer: client, kind: page, frame: { device: mobile, width: 390, height: 844 } }
  Signup: { zone: app, layer: client, kind: form, frame: { device: mobile, width: 390, height: 844 } }
  Verify: { zone: app, layer: client, kind: page, frame: { device: mobile, width: 390, height: 844 } }
  Profile: { zone: app, layer: client, kind: form, frame: { device: mobile, width: 390, height: 844 } }
  Consent: { zone: external_consent, layer: external, kind: webview, frame: { device: mobile, width: 390, height: 844 } }
  Dashboard: { zone: app, layer: client, kind: completion_screen, frame: { device: mobile, width: 390, height: 844 } }
  ErrorScreen: { zone: app, layer: client, kind: error_screen, frame: { device: mobile, width: 390, height: 844 } }
edges:
  Welcome->Signup:
    flow: navigate
    trigger: click
    hotspot: { x: 40, y: 680, width: 310, height: 56 }
  Signup->Verify:
    flow: submit
    trigger: submit
    data: signup_form
    hotspot: { x: 40, y: 680, width: 310, height: 56 }
  Verify->Profile:
    flow: success
    trigger: redirect
    auth: { token: session, issuer: Verify, validatedBy: Dashboard }
  Profile->Consent:
    flow: redirect
    trigger: click
    data: consent_request
    boundaryCrossing: true
    hotspot: { x: 40, y: 600, width: 310, height: 56 }
  Consent->Dashboard:
    flow: redirect
    trigger: redirect
    data: consent_result
    boundaryCrossing: true
  Signup->ErrorScreen:
    flow: error
    trigger: submit
    data: signup_form
data:
  signup_form: { classification: personal, storage: transient, flows: [Signup->Verify, Signup->ErrorScreen] }
  consent_request: { classification: personal, storage: transient, flows: [Profile->Consent] }
  consent_result: { classification: confidential, storage: transient, flows: [Consent->Dashboard] }
zones:
  app: { label: Mobile App, kind: client, contains: [Welcome, Signup, Verify, Profile, Dashboard, ErrorScreen] }
  external_consent: { label: Consent Provider, kind: partner, contains: [Consent] }
boundaries:
  consent_boundary: { label: External Consent Boundary, kind: trust_boundary, contains: [zone: external_consent] }
scenarios:
  happy_path:
    label: Onboarding happy path
    start: Welcome
    steps:
      - Welcome->Signup
      - Signup->Verify
      - Verify->Profile
      - Profile->Consent
      - Consent->Dashboard
  validation_error:
    label: Signup validation error
    start: Welcome
    steps:
      - Welcome->Signup
      - Signup->ErrorScreen
view:
  default:
    base: prototype
    overlays: [auth, dataflow, boundary, validation]
`),
  },
  {
    id: "enterprise-network",
    title: "Enterprise network landing zone",
    category: "Network design",
    description: "Shared VPC, service projects, private service access, on-prem VPN, and peering.",
    recommendation: {
      baseView: "overview",
      renderMode: "2d",
      overlays: ["zone", "boundary", "dataflow", "permission"],
    },
    source: source(`
graph LR
  OnPrem[On-prem Network] -->|IPsec VPN| VPN[Cloud VPN]
  VPN -->|route| SharedVPC[Shared VPC]
  SharedVPC -->|host subnet| HostSubnet[Host Subnet]
  SharedVPC -->|prd subnet| PrdSubnet[Prod Subnet]
  SharedVPC -->|stg subnet| StgSubnet[Staging Subnet]
  PrdSubnet -->|private access| CloudSQL[(Cloud SQL)]
  StgSubnet -->|private access| Cache[(Memorystore)]
  Producer[Service Producer VPC] -->|VPC peering| SharedVPC
  NetOps[Network Ops] -->|change route| Router[Cloud Router]
  Router -->|advertise| VPN
---
title: "Enterprise network landing zone"
nodes:
  OnPrem: { zone: onprem, layer: external, kind: network_boundary }
  VPN: { zone: host_project, layer: network, kind: vpn, provider: gcp }
  SharedVPC: { zone: host_project, layer: network, kind: vpc, provider: gcp }
  HostSubnet: { zone: host_project, layer: network, kind: subnet, provider: gcp }
  PrdSubnet: { zone: service_projects, layer: network, kind: subnet, provider: gcp }
  StgSubnet: { zone: service_projects, layer: network, kind: subnet, provider: gcp }
  CloudSQL: { zone: service_projects, layer: data, kind: relational_database, provider: gcp }
  Cache: { zone: service_projects, layer: data, kind: cache, provider: gcp }
  Producer: { zone: producer, layer: external, kind: vpc, provider: gcp }
  NetOps: { zone: operations, layer: operations, kind: user, principal: network-admin }
  Router: { zone: host_project, layer: network, kind: router, provider: gcp }
edges:
  OnPrem->VPN: { flow: network_route, data: private_traffic, boundaryCrossing: true }
  VPN->SharedVPC: { flow: network_route, data: private_traffic }
  SharedVPC->HostSubnet: { flow: network_route, data: subnet_route }
  SharedVPC->PrdSubnet: { flow: network_route, data: subnet_route }
  SharedVPC->StgSubnet: { flow: network_route, data: subnet_route }
  PrdSubnet->CloudSQL: { flow: data_access, data: app_private_data }
  StgSubnet->Cache: { flow: data_access, data: cache_entry }
  Producer->SharedVPC: { flow: network_route, data: service_endpoint, boundaryCrossing: true }
  NetOps->Router: { flow: admin_operation, data: route_change, principal: network-admin }
  Router->VPN: { flow: network_route, data: route_advertisement }
identities:
  network-admin: { kind: user, provider: internal, attachedTo: NetOps }
data:
  private_traffic: { classification: confidential, storage: transient, flows: [OnPrem->VPN, VPN->SharedVPC] }
  subnet_route: { classification: internal, storage: transient, flows: [SharedVPC->HostSubnet, SharedVPC->PrdSubnet, SharedVPC->StgSubnet] }
  app_private_data: { classification: confidential, storage: durable, storedIn: [CloudSQL], flows: [PrdSubnet->CloudSQL] }
  cache_entry: { classification: internal, storage: transient, storedIn: [Cache], flows: [StgSubnet->Cache] }
  service_endpoint: { classification: internal, storage: transient, flows: [Producer->SharedVPC] }
  route_change: { classification: confidential, storage: durable, flows: [NetOps->Router] }
  route_advertisement: { classification: internal, storage: transient, flows: [Router->VPN] }
permissions:
  route_admin: { principal: network-admin, action: update, resource: Router, role: roles/compute.networkAdmin }
zones:
  onprem: { label: On-premises, kind: onprem, contains: [OnPrem] }
  host_project: { label: Shared VPC Host Project, kind: project, contains: [VPN, SharedVPC, HostSubnet, Router] }
  service_projects: { label: Service Projects, kind: project, contains: [PrdSubnet, StgSubnet, CloudSQL, Cache] }
  producer: { label: Service Producer, kind: partner, contains: [Producer] }
  operations: { label: Network Operations, kind: operations, contains: [NetOps] }
boundaries:
  private_network: { label: Private Network Boundary, kind: network_boundary, contains: [zone: host_project, zone: service_projects] }
  onprem_boundary: { label: On-prem Boundary, kind: trust_boundary, contains: [zone: onprem] }
view:
  default:
    base: overview
    overlays: [zone, boundary, dataflow, permission]
`),
  },
  {
    id: "ai-rag-service",
    title: "RAG service blueprint",
    category: "AI application",
    description: "Document ingestion, vector retrieval, API serving, model provider boundary, and observability.",
    recommendation: {
      baseView: "overview",
      renderMode: "3d",
      overlays: ["zone", "dataflow", "boundary", "permission"],
    },
    source: source(`
graph LR
  Admin[Content Admin] -->|upload| Upload[Upload Portal]
  Upload -->|store docs| Bucket[(Document Bucket)]
  Bucket -->|trigger| Ingest[Ingest Worker]
  Ingest -->|embed chunks| ModelAPI[Model API]
  Ingest -->|write vectors| VectorDB[(Vector DB)]
  User[End User] -->|ask| Web[Web App]
  Web -->|HTTPS + JWT| APIGW[API Gateway]
  APIGW -->|retrieve| RAG[RAG Service]
  RAG -->|vector search| VectorDB
  RAG -->|generate| ModelAPI
  RAG -->|logs| Observability[Observability]
---
title: "RAG service blueprint"
nodes:
  Admin: { zone: admin, layer: client, kind: user }
  Upload: { zone: admin, layer: client, kind: web_app }
  Bucket: { zone: data, layer: data, kind: object_storage, provider: gcp }
  Ingest: { zone: processing, layer: runtime, kind: batch_job, provider: gcp, principal: ingest-sa }
  ModelAPI: { zone: external_ai, layer: external, kind: external_page, provider: openai }
  VectorDB: { zone: data, layer: data, kind: nosql_database, provider: gcp }
  User: { zone: client, layer: client, kind: user }
  Web: { zone: client, layer: client, kind: web_app }
  APIGW: { zone: serving, layer: edge, kind: api_gateway, provider: gcp }
  RAG: { zone: serving, layer: runtime, kind: serverless_service, provider: gcp, principal: rag-sa }
  Observability: { zone: operations, layer: operations, kind: monitoring, provider: gcp }
edges:
  Admin->Upload: { flow: request, data: doc_upload }
  Upload->Bucket: { flow: data_write, data: source_document }
  Bucket->Ingest: { flow: event_publish, data: source_document }
  Ingest->ModelAPI: { flow: api_call, data: document_chunk, boundaryCrossing: true }
  Ingest->VectorDB: { flow: data_write, data: vector_embedding, principal: ingest-sa }
  User->Web:
    flow: request
    data: question
    auth: { token: JWT, issuer: APIGW, validatedBy: APIGW }
  Web->APIGW:
    flow: request
    data: question
    auth: { token: JWT, issuer: APIGW, validatedBy: APIGW }
  APIGW->RAG: { flow: request, data: question }
  RAG->VectorDB: { flow: data_read, data: vector_embedding, principal: rag-sa }
  RAG->ModelAPI: { flow: api_call, data: prompt_context, boundaryCrossing: true }
  RAG->Observability: { flow: telemetry_export, data: inference_metric }
identities:
  ingest-sa: { kind: service_account, provider: gcp, attachedTo: Ingest }
  rag-sa: { kind: service_account, provider: gcp, attachedTo: RAG }
data:
  doc_upload: { classification: confidential, storage: transient, flows: [Admin->Upload] }
  source_document: { classification: confidential, storage: durable, storedIn: [Bucket], flows: [Upload->Bucket, Bucket->Ingest] }
  document_chunk: { classification: confidential, storage: transient, flows: [Ingest->ModelAPI] }
  vector_embedding: { classification: confidential, storage: durable, storedIn: [VectorDB], flows: [Ingest->VectorDB, RAG->VectorDB] }
  question: { classification: personal, storage: transient, flows: [User->Web, Web->APIGW, APIGW->RAG] }
  prompt_context: { classification: confidential, storage: transient, flows: [RAG->ModelAPI] }
  inference_metric: { classification: internal, storage: transient, flows: [RAG->Observability] }
permissions:
  ingest_vectors: { principal: ingest-sa, action: write, resource: VectorDB, role: vector.writer }
  rag_vectors: { principal: rag-sa, action: read, resource: VectorDB, role: vector.reader }
zones:
  admin: { label: Content Admin, kind: client, contains: [Admin, Upload] }
  client: { label: End User, kind: client, contains: [User, Web] }
  data: { label: Knowledge Data, kind: project, contains: [Bucket, VectorDB] }
  processing: { label: Ingestion Processing, kind: project, contains: [Ingest] }
  serving: { label: Serving Runtime, kind: project, contains: [APIGW, RAG] }
  external_ai: { label: External AI Provider, kind: partner, contains: [ModelAPI] }
  operations: { label: Operations, kind: operations, contains: [Observability] }
boundaries:
  ai_provider_boundary: { label: AI Provider Boundary, kind: trust_boundary, contains: [zone: external_ai] }
  knowledge_boundary: { label: Knowledge Data Boundary, kind: policy_boundary, contains: [zone: data] }
view:
  default:
    base: overview
    overlays: [zone, dataflow, boundary, permission]
`),
  },
  {
    id: "cloud-migration-timeline",
    title: "Cloud migration timeline (4D)",
    category: "Evolution / 4D",
    description: "On-prem to cloud migration across four phases; scrub the phase slider to watch components appear, deprecate, and retire.",
    recommendation: {
      baseView: "overview",
      renderMode: "2d",
      overlays: ["zone", "timeline"],
    },
    source: source(`
graph LR
  Web[Web Frontend] --> AppOld[Legacy App]
  Web --> AppNew[Cloud App]
  AppOld --> DbOld[(Legacy DB)]
  AppNew --> DbNew[(Cloud DB)]
  DbOld -->|replicate| DbNew
---
title: "Cloud migration timeline"
description: "Blue-green style on-prem to cloud migration modeled as timeline phases."
nodes:
  Web:
    zone: client
    layer: client
    kind: web_app
  AppOld:
    zone: onprem
    layer: runtime
    kind: runtime_service
    principal: legacy-app-sa
    lifecycle: { removed: done, states: { cutover: deprecated } }
  DbOld:
    zone: onprem
    layer: data
    kind: legacy_database
    lifecycle: { removed: done, states: { cutover: deprecated } }
  AppNew:
    zone: cloud
    layer: runtime
    kind: runtime_service
    provider: gcp
    principal: cloud-app-sa
    lifecycle: { added: parallel, states: { parallel: planned, cutover: active } }
  DbNew:
    zone: cloud
    layer: data
    kind: relational_database
    provider: gcp
    lifecycle: { added: parallel, states: { parallel: planned, cutover: active } }
edges:
  Web->AppOld:
    flow: request
    boundaryCrossing: true
  Web->AppNew:
    flow: request
    boundaryCrossing: true
  AppOld->DbOld:
    flow: data_access
    principal: legacy-app-sa
  AppNew->DbNew:
    flow: data_access
    principal: cloud-app-sa
  DbOld->DbNew:
    flow: replication
    boundaryCrossing: true
    lifecycle: { added: parallel, removed: done }
identities:
  legacy-app-sa: { kind: service_account, attachedTo: AppOld }
  cloud-app-sa: { kind: service_account, provider: gcp, attachedTo: AppNew }
zones:
  client:
    label: Client
    kind: client
    contains: [Web]
  onprem:
    label: On-premises
    kind: onprem
    contains: [AppOld, DbOld]
    lifecycle: { removed: done }
  cloud:
    label: Cloud
    kind: cloud
    contains: [AppNew, DbNew]
    lifecycle: { added: parallel }
timeline:
  label: Migration
  phases:
    now: { label: "Today" }
    parallel: { label: "Parallel run", at: "2026-Q3" }
    cutover: { label: "Cutover", at: "2026-Q4" }
    done: { label: "Cloud only", at: "2027-Q1" }
  default: now
view:
  default:
    base: overview
    overlays: [zone, timeline]
`),
  },
];

export function getArchMapSample(id: string): ArchMapSample | undefined {
  return DEFAULT_ARCHMAP_SAMPLES.find((sample) => sample.id === id);
}
