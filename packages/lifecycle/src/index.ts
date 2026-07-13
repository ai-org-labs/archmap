import {
  defaultArchMap,
  type ArchMapInstance,
  type ArchMapPlugin,
  type ValidatorDefinition,
} from "@archmap/core";
import { LIFECYCLE_ELEMENT_TYPES, LIFECYCLE_RELATION_TYPES } from "./vocabulary.js";
import { LIFECYCLE_VIEWS } from "./views.js";

const lifecycleRegistrationValidator: ValidatorDefinition = {
  name: "lifecycle_registered_schema",
  validate: () => [],
};

export const lifecyclePlugin: ArchMapPlugin = {
  name: "@archmap/lifecycle",
  version: "0.4.0-dev.1",
  requires: { "@archmap/core": "^0.3.0" },
  elementTypes: [...LIFECYCLE_ELEMENT_TYPES],
  relationTypes: [...LIFECYCLE_RELATION_TYPES],
  validators: [lifecycleRegistrationValidator],
  views: [...LIFECYCLE_VIEWS],
};

export function installLifecycle(instance: ArchMapInstance = defaultArchMap): ArchMapInstance {
  return instance.use(lifecyclePlugin);
}

export default lifecyclePlugin;

export * from "./types.js";
export * from "./vocabulary.js";
export { LIFECYCLE_VIEWS } from "./views.js";
