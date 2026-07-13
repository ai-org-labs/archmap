import type { ElementTypeDefinition, RelationTypeDefinition } from "@archmap/core";

export const LIFECYCLE_ELEMENT_TYPES = [
  { name: "requirement", section: "requirements", required: ["title", "type"], description: "A condition the system or delivery must satisfy." },
  { name: "acceptanceCriterion", section: "acceptanceCriteria", required: ["requirement", "statement"], description: "An observable condition used to accept a requirement." },
  { name: "decision", section: "decisions", required: ["title", "status"], description: "A recorded product, architecture, or operational decision." },
  { name: "risk", section: "risks", required: ["title"], description: "An uncertain event with potential impact." },
  { name: "test", section: "tests", required: ["title", "type"], description: "A defined verification activity." },
  { name: "evidence", section: "evidence", required: ["type", "status"], description: "Inert evidence metadata supporting a verification result." },
  { name: "lifecycleRelation", section: "relations", description: "A typed relation across lifecycle and architecture records." },
] as const satisfies readonly ElementTypeDefinition[];

const relation = (name: string, inverse?: string, acyclic = false): RelationTypeDefinition => ({ name, inverse, acyclic });

export const LIFECYCLE_RELATION_TYPES = [
  relation("derives", undefined, true),
  relation("refines", undefined, true),
  relation("decomposes", undefined, true),
  relation("satisfies"),
  relation("implemented_by"),
  relation("realized_by"),
  relation("verified_by"),
  relation("evidenced_by"),
  relation("mitigated_by"),
  relation("released_in"),
  relation("monitored_by"),
  relation("related_to"),
] as const satisfies readonly RelationTypeDefinition[];

export const REQUIREMENT_STATUSES = [
  "draft", "proposed", "reviewed", "approved", "in_progress", "implemented",
  "verified", "released", "rejected", "deferred", "deprecated",
] as const;

export const DECISION_STATUSES = ["proposed", "accepted", "rejected", "deprecated", "superseded"] as const;
export const RISK_STATUSES = ["identified", "analyzing", "mitigating", "monitoring", "accepted", "resolved", "occurred", "closed"] as const;
export const VERIFICATION_STATUSES = ["not_planned", "planned", "ready", "running", "passed", "failed", "blocked", "skipped", "expired"] as const;
