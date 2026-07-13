import type { ElementTypeDefinition, RelationTypeDefinition } from "@archmap/core";

export const LIFECYCLE_ELEMENT_TYPES = [
  { name: "requirement", section: "requirements", description: "A condition the system or delivery must satisfy." },
  { name: "acceptanceCriterion", section: "acceptanceCriteria", description: "An observable condition used to accept a requirement." },
  { name: "decision", section: "decisions", description: "A recorded product, architecture, or operational decision." },
  { name: "risk", section: "risks", description: "An uncertain event with potential impact." },
  { name: "test", section: "tests", description: "A defined verification activity." },
  { name: "evidence", section: "evidence", description: "Inert evidence metadata supporting a verification result." },
  { name: "lifecycleRelation", section: "relations", description: "A typed relation across lifecycle and architecture records." },
] as const satisfies readonly ElementTypeDefinition[];

const relation = (name: string, inverse?: string): RelationTypeDefinition => ({ name, inverse });

export const LIFECYCLE_RELATION_TYPES = [
  relation("derives"),
  relation("refines"),
  relation("decomposes"),
  relation("satisfies"),
  relation("implemented_by"),
  relation("realized_by"),
  relation("verified_by"),
  relation("evidenced_by"),
  relation("mitigated_by"),
  relation("released_in"),
  relation("monitored_by"),
] as const satisfies readonly RelationTypeDefinition[];

export const REQUIREMENT_STATUSES = [
  "draft", "proposed", "reviewed", "approved", "in_progress", "implemented",
  "verified", "released", "rejected", "deferred", "deprecated",
] as const;

export const DECISION_STATUSES = ["proposed", "accepted", "rejected", "deprecated", "superseded"] as const;
export const RISK_STATUSES = ["identified", "analyzing", "mitigating", "monitoring", "accepted", "resolved", "occurred", "closed"] as const;
export const VERIFICATION_STATUSES = ["not_planned", "planned", "ready", "running", "passed", "failed", "blocked", "skipped", "expired"] as const;
