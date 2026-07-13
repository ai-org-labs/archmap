import { defaultArchMap, type ArchMapInstance, type ArchMapPlugin } from "@archmap/core";
import { LIFECYCLE_ELEMENT_TYPES, LIFECYCLE_RELATION_TYPES } from "./vocabulary.js";
import { LIFECYCLE_VIEWS } from "./views.js";
import { lifecycleValidator } from "./validate.js";

export const lifecyclePlugin: ArchMapPlugin = {
  name: "@archmap/lifecycle",
  version: "0.4.0-dev.1",
  requires: { "@archmap/core": "^0.3.0" },
  elementTypes: [...LIFECYCLE_ELEMENT_TYPES],
  relationTypes: [...LIFECYCLE_RELATION_TYPES],
  validators: [lifecycleValidator],
  views: [...LIFECYCLE_VIEWS],
};

export function installLifecycle(instance: ArchMapInstance = defaultArchMap): ArchMapInstance {
  return instance.use(lifecyclePlugin);
}

export default lifecyclePlugin;

export * from "./types.js";
export * from "./vocabulary.js";
export * from "./serialize.js";
export * from "./validate.js";
export { LIFECYCLE_VIEWS } from "./views.js";
