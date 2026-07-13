# Requirements and Lifecycle Graph

Status: Approved direction for v0.4.0 planning  
Baseline: ArchMap v0.3.0  
Initial target: v0.4.0  
Long-term target: 1.0

## 1. Product definition

ArchMap is a DSL and rendering platform that defines the software lifecycle as
a semantic graph and projects that graph into purpose-specific views.

The canonical graph covers why a system exists, what it must satisfy, how it is
designed, which risks and decisions shape it, how it is tested, which evidence
supports it, whether it is releasable, and how it behaves in operation.

The same graph can project Requirements, Use Case, Traceability, Architecture,
Dataflow, Security, Quality, Risk, Release Readiness, Operations, Timeline, and
Change Impact views. Views do not own independent lifecycle data.

## 2. Design principles

1. **One canonical graph.** Requirements, architecture, tests, evidence, and
   operations are objects in one model.
2. **Additive compatibility.** Existing `nodes`, `edges`, `zones`, `boundaries`,
   `identities`, `permissions`, `data`, `scenarios`, `timeline`, `layout`, and
   `view` remain valid. v0.3 documents require no migration for v0.4 parsing.
3. **Progressive elaboration.** Authors may start with a goal or requirement and
   add acceptance, design, risk, delivery, quality, release, and operations data
   over time. Incomplete early models produce useful diagnostics, not rejection.
4. **Git-native text.** Source remains human-readable, diffable, reviewable, and
   mergeable.
5. **Human/AI collaboration.** AI may propose missing objects, relations, tests,
   risks, readiness findings, and GraphPatch operations. Proposed and approved
   state must remain distinct; AI cannot fabricate approval or evidence.
6. **Stable identity.** Explicit IDs survive parse, normalization, query,
   rendering, export, and patch application.

ArchMap owns semantic relationships and traceability. WorkLens may provide
List/Board/Tree/Timeline/Owner operation views; Noblit may provide document,
editing, and presentation surfaces; QIF owns quality and evidence evaluation.

## 3. Lifecycle scope

```text
Business Goal -> Stakeholder Need -> Requirement -> Acceptance Criterion
  -> Architecture / UX / API / Data -> Decision / Risk / Task
  -> Test -> Evidence -> Release Gate -> Deployment
  -> Operation / Monitoring / Incident -> Feedback / New Requirement
```

Full project management, kanban, WBS, time tracking, chat, source hosting, CI
execution, and SaaS organization/billing are outside the initial scope.

## 4. Canonical lifecycle extension

v0.4 allows lifecycle data without replacing the existing architecture model,
but the lifecycle vocabulary is installed by `@archmap/lifecycle`; it is not
hard-coded into `@archmap/core`.

```ts
interface ArchMapModel {
  // existing v0.3 architecture collections remain unchanged
  extensions: {
    lifecycle?: {
      elements: LifecycleElement[];
      relations: LifecycleRelation[];
    };
  };
}
```

Architecture nodes and lifecycle objects may later share a common GraphElement
base, but v0.4 must avoid a broad internal-model rewrite. Core owns generic
extension element/relation containers and registries; the lifecycle plugin owns
Requirement, Risk, Test, Evidence, lifecycle validators, and lifecycle views.

All lifecycle elements support stable `id`, optional `extensions`, tags, and
source provenance. Standard fields are typed; unknown extension fields are
preserved under `extensions`.

## 5. Domain objects

### 5.1 Business

- **Goal**: required `id`, `title`; optional description, owner, status,
  priority, successMetrics, targetDate, tags.
- **Outcome**: metric, baseline, target, measurementMethod, evaluationDate.
- **Stakeholder**: kind, role, organization, responsibilities, concerns,
  contactRef.
- **BusinessRule**: statement, source, authority, effectiveFrom, effectiveTo,
  exceptions.

### 5.2 Requirements

**Requirement** requires `id`, `title`, and `type`. Standard types:

`business`, `stakeholder`, `functional`, `non_functional`, `constraint`,
`interface`, `data`, `security`, `privacy`, `compliance`, `operational`,
`migration`, `usability`, `accessibility`, `performance`, `availability`, and
`maintainability`.

Optional fields: description, rationale, source, owner, status, priority,
mustShouldCould, fitCriterion, assumptions, dependencies, version, tags,
introducedAt, deprecatedAt, extensions.

Requirement hierarchy/relation vocabulary: `derives`, `decomposes`, `refines`,
`depends_on`, `conflicts_with`, `duplicates`, `replaces`, `supersedes`, and
`related_to`.

**AcceptanceCriterion** requires `id`, `requirement`, and `statement`. It may
also use format, given, when, then, threshold, measurement,
verificationMethod, owner, status, automated, and tags.

**UseCase** may define actor, goal, preconditions, trigger, mainFlow,
alternateFlows, exceptions, postconditions, and relatedRequirements.

**UserStory** may define asA, iWant, soThat, acceptanceCriteria, persona, and
storyPoints.

**Assumption** may define statement, owner, validationMethod, status,
validUntil, and impactIfFalse.

**Constraint** may define type, statement, source, mandatory, and scope.

### 5.3 UX

Lifecycle relations may target Screen, ScreenState, UserFlow, Prototype,
Interaction, Persona, Journey, and AccessibilityRequirement. This integrates
with the existing ScreenFlow/Prototype model rather than duplicating it.

### 5.4 Architecture

Requirements may target existing Node, Edge, Zone, Boundary, Identity,
Permission, DataObject, Scenario, and TimelinePhase IDs through relations such
as `implemented_by`, `realized_by`, `allocated_to`, `constrained_by`,
`secured_by`, `stores`, `processes`, `transmits`, and `monitored_by`.

### 5.5 Decisions

**Decision** requires `id`, `title`, and `status`. Status is `proposed`,
`accepted`, `rejected`, `deprecated`, or `superseded`. Optional fields include
context, decision, rationale, alternatives, consequences, owner, decidedAt,
reviewAt, supersedes, and tags. Decisions may relate to requirements, risks,
architecture elements, and releases.

### 5.6 Risks

**Risk** requires `id` and `title`. Optional fields include description,
category, probability, impact, severity, exposure, owner, status, trigger,
mitigation, contingency, dueDate, residualRisk, and acceptedBy.

Standard categories: business, schedule, technical, architecture, security,
privacy, compliance, quality, operation, cost, dependency, supply_chain, AI.
Risks may relate to requirements, architecture, decisions, tasks, tests,
controls, and releases.

### 5.7 Delivery

- **Task**: title, owner, status, priority, estimate, dueDate, milestone,
  repository, issueRef, pullRequestRef.
- **Milestone**: a lifecycle checkpoint grouping deliverables/requirements.
- **Deliverable**: document, code, configuration, or model output.
- **Change**: reason, proposedBy, approvedBy, affectedElements, introducedAt,
  changeRef.

ArchMap models meaning and traceability; task-board operations may live in
WorkLens.

### 5.8 Quality

**Test** requires `id`, `title`, and `type`. Standard types: review, unit,
integration, contract, component, system, end_to_end, acceptance, performance,
load, security, accessibility, usability, resilience, disaster_recovery,
migration, manual. Optional fields: framework, environment, automated,
frequency, trigger, owner, status, expectedResult, thresholds, repository,
file, command.

**Verification** links a Requirement or AcceptanceCriterion to inspection,
analysis, demonstration, test, simulation, or measurement.

**Evidence** requires `id`, `type`, and `status`. Standard types: test_result,
screenshot, video, log, metric, report, review_record, approval, trace,
benchmark, audit_record, deployment_record. Optional fields include producedBy,
producedAt, source, uri, hash, result, value, unit, sampleCount, duration,
environment, version, expiresAt, summary.

**QualityGate** aggregates conditions, requiredEvidence, evaluator, status,
evaluatedAt, result, and exceptions.

### 5.9 Security and privacy

First-class future elements: Threat, Vulnerability, SecurityControl,
PrivacyControl, Policy, ComplianceRequirement, AuditFinding, Exception,
DataClassification, DataSubject, ProcessingPurpose, RetentionRule. These connect
to existing identity, permission, boundary, and data elements. The expected
trace is Threat -> Control -> Test -> Evidence.

### 5.10 Release

**Release** may define version, status, targetDate, deployedAt, environment,
includedRequirements, includedChanges, requiredGates, and approvals.

**ReleaseGate** evaluates required requirements, criteria, tests, evidence,
high risks, security approval, operational preparation, rollback, monitoring,
and accepted known issues.

**Approval** may define approver, role, decision, reason, approvedAt, scope, and
expiresAt. AI-generated content cannot assert human approval.

### 5.11 Operations

Future operation elements include Deployment, Environment, Service, SLI, SLO,
SLA, Monitor, Alert, Dashboard, Runbook, Incident, Problem,
OperationalEvidence, and Feedback. An operational requirement must be traceable
through SLO -> Monitor -> Alert -> operational evidence.

## 6. Typed relation model

Relations are first-class, directed, many-to-many, and queryable in both
directions. Each relation has a stable identity or deterministic key, typed
`from`, `to`, and `type`, optional description/provenance/extensions, and
resolved endpoint kinds.

Standard relation families:

- Requirement: derives, refines, decomposes, satisfies, verifies, validates,
  conflicts_with, depends_on.
- Realization: implemented_by, realized_by, allocated_to, exposed_by,
  stored_in, processed_by, transmitted_by.
- Quality: accepted_by, tested_by, evidenced_by, measured_by, gated_by.
- Risk: introduces, mitigated_by, controlled_by, accepted_by, impacts.
- Delivery: delivered_by, planned_in, included_in, released_in, deployed_to.
- Operations: monitored_by, alerted_by, operated_by, recovered_by, affected_by.

External references (GitHub Issue/PR/commit, source file, OpenAPI operation,
Terraform/Kubernetes resource, test code, CI workflow, external document, or
ticket) are distinct from internal graph IDs and are never auto-executed.

## 7. DSL

v0.4 prioritizes additive YAML top-level sections:

```text
goals, stakeholders, businessRules, requirements, acceptanceCriteria,
useCases, assumptions, constraints, decisions, risks, tasks, milestones,
tests, verifications, evidence, qualityGates, controls, releases,
releaseGates, approvals, operations, relations
```

The graph section remains unchanged in v0.4. Direct declarations such as
`requirement REQ-001[...]` are reserved for a later version.

```archmap
graph LR
  User[User] --> Login[Login Screen]
  Login --> API[Auth API]
---
requirements:
  REQ-001:
    title: User can sign in
    type: functional
    priority: must
acceptanceCriteria:
  AC-001:
    requirement: REQ-001
    statement: Successful sign-in opens Home
tests:
  TEST-001:
    title: Login end-to-end test
    type: end_to_end
    framework: Playwright
    automated: true
evidence:
  EVD-001:
    type: test_result
    status: passed
    source: artifacts/login-report.json
relations:
  - { from: REQ-001, to: Login, type: realized_by }
  - { from: AC-001, to: TEST-001, type: verified_by }
  - { from: TEST-001, to: EVD-001, type: evidenced_by }
```

Recommended prefixes are GOAL-, STK-, BR-, REQ-, AC-, UC-, ASM-, CON-, DEC-,
RISK-, TASK-, TEST-, EVD-, GATE-, REL-, DEP-, INC-. Prefixes are configurable,
not mandatory.

## 8. Views

- **Requirements**: goals, stakeholders, requirements, acceptance criteria,
  rules, assumptions, constraints; hierarchy, state, priority, owner, gaps,
  conflicts.
- **Traceability**: expand any start element through typed relations; filter by
  type, status, owner, release, phase, risk, and depth.
- **Coverage**: acceptance, architecture allocation, test, evidence, risk owner,
  and operational monitor ratios.
- **Quality**: requirements, criteria, tests, evidence, gates; distinguish test
  type, result, and evidence freshness.
- **Risk**: risks, impacts, mitigations, verification, residual risk.
- **Release Readiness**: release scope, incomplete requirements, unverified
  criteria, failed tests, missing/stale evidence, unresolved high risk,
  unapproved decisions, operational readiness, gate result.
- **Change Impact**: changed element -> requirements -> screens/consumers ->
  tests -> evidence -> releases -> monitors.
- **Timeline integration**: lifecycle added/changed/deprecated/replaced/planned
  states apply to requirements, decisions, risks, tests, and releases.

## 9. Validation and readiness

Structural validation detects unknown references, duplicate IDs, invalid
relation types, missing required fields, invalid status, cyclic requirement
hierarchies, self-dependency, and unknown release scope.

Quality diagnostics may flag ambiguous wording, missing owner/source/priority,
missing acceptance criteria, missing non-functional fit criterion,
unverifiable language, duplicates/conflicts, and dependency on unapproved work.

Traceability diagnostics include orphan requirements, unallocated requirements,
architecture with no requirement, criteria without tests, tests without
evidence, high risks without mitigation, tasks without requirements, completed
requirements outside a release, and operational requirements without monitors.

Diagnostic severity is `info`, `warning`, `error`, or `blocking`. Blocking
diagnostics make Release Ready false. Policies are project-configurable and
must remain evaluation data, not hard-coded state transitions.

Standard statuses:

- Requirement: draft, proposed, reviewed, approved, in_progress, implemented,
  verified, released, rejected, deferred, deprecated.
- Verification: not_planned, planned, ready, running, passed, failed, blocked,
  skipped, expired.
- Risk: identified, analyzing, mitigating, monitoring, accepted, resolved,
  occurred, closed.
- Release: planned, in_progress, candidate, blocked, approved, released,
  rolled_back, retired.

## 10. AI and GraphPatch

AI may propose missing criteria, non-functional/error/security/operations
requirements, tests, evidence, risks, owners, dependencies, and relations.

AI changes use GraphPatch rather than replacing the complete model:

```yaml
patch:
  id: PATCH-001
  proposedBy: ai
  status: proposed
  operations:
    - add:
        type: acceptanceCriterion
        id: AC-002
        value:
          requirement: REQ-001
          statement: Invalid credentials show an error
```

Patch states: proposed, reviewed, accepted, rejected, applied. Suggestions must
show supporting requirements, rules, or graph elements. AI cannot directly mark
an item approved or invent evidence.

## 11. QIF, WorkLens, and Noblit

- QIF evaluates coverage, evidence completeness/freshness, quantitative results,
  quality gates, and release readiness. Results map back to graph elements.
- WorkLens uses a compatible model for List, Board, Tree, Timeline, Dependency,
  and Owner operational views.
- Noblit embeds ArchMap code blocks with editing, live preview, view switching,
  diagnostics, detail panels, relation selection, Markdown references, slides,
  and requirement-review presentation.

## 12. Public API direction

```ts
parse(source): ArchMapModel
validate(model, options): Diagnostic[]
render(model, options): RenderResult
query(model, query): GraphElement[]
trace(model, start, options): TraceResult
coverage(model, options): CoverageResult
evaluateReadiness(model, policy): ReadinessResult
diff(baseModel, targetModel): ModelDiff
applyPatch(model, patch): PatchResult
```

Core v0.4 public additions start with plugin/element/relation/validator
registration, generic query/trace, and JSON serialization. Lifecycle-specific
types and view helpers are exported by `@archmap/lifecycle`. Coverage,
readiness, diff, and patches may follow after the plugin model is stable.

## 13. Non-functional requirements

- Normal interaction at 1,000 elements; filtered/partial rendering at 10,000.
- Views extract only required subgraphs; do not always mount the entire graph.
- Cache layout/projection results where semantics and geometry are unchanged.
- Support custom object types, attributes, relations, validators, views, and
  policies through registration/plugin APIs.
- Browser-only and static-file use, Node parse/validate, ESM, and desktop embed.
- Deterministic semantic model and stable layout for identical input/options.
- Never execute external references; escape HTML/SVG; do not trust Evidence URI;
  distinguish AI proposals from human approvals; warn on embedded secrets.
- Keyboard operation, accessible labels, non-color state encoding, zoom, high
  contrast, and text alternative output.

## 14. Scale and export

Future composition supports `imports`, `namespace`, `projections`, and lazy
loading. Initial exports: JSON, YAML, SVG, PNG, Markdown, HTML, and CSV
traceability. Later adapters may target ReqIF, SARIF, CycloneDX, JUnit, GitHub,
Jira, OpenAPI, Terraform, and Kubernetes. Full ReqIF compatibility is not an
initial requirement.

## 15. Roadmap

- **v0.4 Requirements Foundation**: Requirement, AcceptanceCriterion, Decision, Risk,
  Test, Evidence, generic Relation; Requirements, Traceability, Quality views;
  structural/gap validation; JSON model output; architecture relations.
- **v0.5 Readiness**: QualityGate, ReleaseGate, coverage, readiness/risk views,
  policies, blocking diagnostics, QIF integration, GraphPatch.
- **v0.6 Lifecycle**: Goal, Stakeholder, BusinessRule, UseCase, Assumption,
  Constraint, Task, Milestone, Deployment, Monitor, SLO, Incident, timeline and
  change-impact integration.
- **v0.7+ Scale/Integration**: imports, namespace, projection, external refs,
  GitHub/OpenAPI/test-result integrations, WorkLens/Noblit, custom schema/policy.

1.0 requires end-to-end requirement-to-evidence and requirement-to-monitor
traceability, v0.3 compatibility, split large models, validation/readiness,
stable APIs, schema versioning/migration, practical views, Git review, and
auditable AI changes.

## 16. Architecture decision record

1. ArchMap is a lifecycle semantic graph language, not a task-management tool.
2. The central value is traceability from requirement through design, test,
   evidence, release, and operations.
3. Existing architecture elements remain and lifecycle objects connect to them.
4. v0.4 prioritizes additive YAML metadata over graph grammar expansion.
5. ArchMap owns meaning, QIF quality evaluation, WorkLens task operations, and
   Noblit document/presentation interaction.
6. The first implementation is intentionally limited to Requirement,
   AcceptanceCriterion, Decision, Risk, Test, Evidence, and Relation.
7. Core owns the semantic graph engine and plugin APIs; lifecycle, quality,
   security, connectors, policies, advanced views, themes, and industry
   vocabulary are installable packages rather than mandatory core weight.
