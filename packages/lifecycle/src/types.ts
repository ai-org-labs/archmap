export type RequirementType =
  | "business" | "stakeholder" | "functional" | "non_functional"
  | "constraint" | "interface" | "data" | "security" | "privacy"
  | "compliance" | "operational" | "migration" | "usability"
  | "accessibility" | "performance" | "availability" | "maintainability"
  | (string & {});

export type RequirementStatus =
  | "draft" | "proposed" | "reviewed" | "approved" | "in_progress"
  | "implemented" | "verified" | "released" | "rejected" | "deferred"
  | "deprecated" | (string & {});

export type DecisionStatus = "proposed" | "accepted" | "rejected" | "deprecated" | "superseded" | (string & {});
export type RiskStatus = "identified" | "analyzing" | "mitigating" | "monitoring" | "accepted" | "resolved" | "occurred" | "closed" | (string & {});
export type VerificationStatus = "not_planned" | "planned" | "ready" | "running" | "passed" | "failed" | "blocked" | "skipped" | "expired" | (string & {});

export interface LifecycleRecord {
  id: string;
  title?: string;
  description?: string;
  owner?: string;
  status?: string;
  tags?: string[];
  extensions?: Record<string, unknown>;
}

export interface Requirement extends LifecycleRecord {
  title: string;
  type: RequirementType;
  status?: RequirementStatus;
  priority?: string;
  rationale?: string;
  source?: string;
  fitCriterion?: string;
  assumptions?: string[];
  dependencies?: string[];
}

export interface AcceptanceCriterion extends LifecycleRecord {
  requirement: string;
  statement: string;
  format?: string;
  given?: string;
  when?: string;
  then?: string;
  threshold?: string | number;
  verificationMethod?: string;
  automated?: boolean;
}

export interface Decision extends LifecycleRecord {
  title: string;
  status: DecisionStatus;
  context?: string;
  decision?: string;
  rationale?: string;
  alternatives?: string[];
  consequences?: string[];
  decidedAt?: string;
  reviewAt?: string;
  supersedes?: string;
}

export interface Risk extends LifecycleRecord {
  title: string;
  category?: string;
  probability?: string | number;
  impact?: string | number;
  severity?: string;
  exposure?: number;
  status?: RiskStatus;
  trigger?: string;
  mitigation?: string;
  contingency?: string;
  residualRisk?: string;
}

export interface Test extends LifecycleRecord {
  title: string;
  type: string;
  framework?: string;
  environment?: string;
  automated?: boolean;
  frequency?: string;
  trigger?: string;
  status?: VerificationStatus;
  expectedResult?: string;
  command?: string;
}

export interface Evidence extends LifecycleRecord {
  type: string;
  status: string;
  producedBy?: string;
  producedAt?: string;
  source?: string;
  uri?: string;
  hash?: string;
  result?: string;
  value?: number;
  unit?: string;
  expiresAt?: string;
  summary?: string;
}

export interface LifecycleRelation {
  id?: string;
  from: string;
  to: string;
  type: string;
  label?: string;
  extensions?: Record<string, unknown>;
}
