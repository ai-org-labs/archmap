import type { ArchMapModel, Diagnostic, ExtensionElement, ValidatorDefinition } from "@archmap/core";

function warning(code: string, message: string, id: string): Diagnostic {
  return { severity: "warning", level: "warning", code, message, ref: { kind: "extension", id }, target: { type: "extension", id } };
}

function related(model: ArchMapModel, from: string, types: string[], targetType: string): boolean {
  const elements = new Map((model.extensions?.elements ?? []).map((element) => [element.id, element]));
  return (model.extensions?.relations ?? []).some((relation) =>
    relation.from === from && types.includes(relation.type) && elementType(elements.get(relation.to)) === targetType,
  );
}

function elementType(element: ExtensionElement | undefined): string | undefined {
  return element?.elementType ?? element?.type;
}

export function validateLifecycle(model: ArchMapModel): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const elements = model.extensions?.elements ?? [];
  const acceptanceByRequirement = new Set(
    elements.filter((element) => elementType(element) === "acceptanceCriterion" && typeof element.requirement === "string")
      .map((element) => String(element.requirement)),
  );
  for (const element of elements) {
    if (elementType(element) === "requirement" && !acceptanceByRequirement.has(element.id)) {
      diagnostics.push(warning("requirement_without_acceptance", `Requirement "${element.id}" has no Acceptance Criterion.`, element.id));
    }
    if (elementType(element) === "acceptanceCriterion" && !related(model, element.id, ["verified_by"], "test")) {
      diagnostics.push(warning("acceptance_without_test", `Acceptance Criterion "${element.id}" has no verifying Test.`, element.id));
    }
    if (elementType(element) === "test" && element.required !== false && !related(model, element.id, ["evidenced_by"], "evidence")) {
      diagnostics.push(warning("test_without_evidence", `Test "${element.id}" has no Evidence.`, element.id));
    }
  }
  return diagnostics;
}

export const lifecycleValidator: ValidatorDefinition = {
  name: "lifecycle_traceability_gaps",
  validate: validateLifecycle,
};

export function lifecycleElements(model: ArchMapModel, type?: string): ExtensionElement[] {
  return (model.extensions?.elements ?? []).filter((element) => !type || elementType(element) === type);
}
