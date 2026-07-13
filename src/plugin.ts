import { syncDiagnostics } from "./diagnostics.js";
import { normalizeRegisteredExtensions } from "./extensions.js";
import { parse as parseCore } from "./parser-entry.js";
import {
  getDefaultViewRegistry,
  getView as getDefaultView,
  listViews as listDefaultViews,
  render as renderCore,
} from "./render.js";
import { ARCHMAP_VERSION } from "./types.js";
import type { RenderOptions, RenderResult, ViewRenderer } from "./render.js";
import type { ArchMapModel, Diagnostic } from "./types.js";

export interface ElementTypeDefinition {
  name: string;
  section?: string;
  description?: string;
}

export interface RelationTypeDefinition {
  name: string;
  from?: string[];
  to?: string[];
  inverse?: string;
  description?: string;
}

export interface ValidatorContext {
  instance: ArchMapInstance;
}

export interface ValidatorDefinition {
  name: string;
  validate(model: ArchMapModel, context: ValidatorContext): void | Diagnostic[];
}

export interface NamedDefinition {
  name: string;
}

export interface ViewDefinition {
  name: string;
  renderer: ViewRenderer;
}

export type PluginCleanup = () => void;

export interface ArchMapPlugin {
  name: string;
  version: string;
  requires?: Record<string, string>;
  conflicts?: string[];
  elementTypes?: ElementTypeDefinition[];
  relationTypes?: RelationTypeDefinition[];
  validators?: ValidatorDefinition[];
  views?: ViewDefinition[];
  overlays?: NamedDefinition[];
  policies?: NamedDefinition[];
  serializers?: NamedDefinition[];
  importers?: NamedDefinition[];
  exporters?: NamedDefinition[];
  themes?: NamedDefinition[];
  install?(context: PluginContext): void | PluginCleanup;
}

export interface PluginContext {
  instance: ArchMapInstance;
  registerElementType(definition: ElementTypeDefinition): void;
  registerRelationType(definition: RelationTypeDefinition): void;
  registerValidator(definition: ValidatorDefinition): void;
  registerView(name: string, renderer: ViewRenderer): void;
  registerOverlay(definition: NamedDefinition): void;
  registerPolicy(definition: NamedDefinition): void;
  registerSerializer(definition: NamedDefinition): void;
  registerImporter(definition: NamedDefinition): void;
  registerExporter(definition: NamedDefinition): void;
  registerTheme(definition: NamedDefinition): void;
}

export interface ArchMapInstance {
  readonly version: string;
  use(plugin: ArchMapPlugin): ArchMapInstance;
  unuse(name: string): boolean;
  listPlugins(): Array<{ name: string; version: string }>;
  parse(source: string): ArchMapModel;
  render(model: ArchMapModel, options?: RenderOptions): RenderResult;
  registerElementType(definition: ElementTypeDefinition): void;
  registerRelationType(definition: RelationTypeDefinition): void;
  registerValidator(definition: ValidatorDefinition): void;
  registerView(name: string, renderer: ViewRenderer): void;
  registerOverlay(definition: NamedDefinition): void;
  registerPolicy(definition: NamedDefinition): void;
  registerSerializer(definition: NamedDefinition): void;
  registerImporter(definition: NamedDefinition): void;
  registerExporter(definition: NamedDefinition): void;
  registerTheme(definition: NamedDefinition): void;
  getElementType(name: string): ElementTypeDefinition | undefined;
  getRelationType(name: string): RelationTypeDefinition | undefined;
  getView(name: string): ViewRenderer | undefined;
  listElementTypes(): string[];
  listRelationTypes(): string[];
  listValidators(): string[];
  listViews(): string[];
}

interface InstalledPlugin {
  plugin: ArchMapPlugin;
  cleanup?: PluginCleanup;
  registrations: Array<{ registry: Map<string, unknown>; name: string }>;
}

function major(version: string): number | undefined {
  const value = Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "", 10);
  return Number.isFinite(value) ? value : undefined;
}

function satisfies(version: string, range: string): boolean {
  const expected = range.trim();
  if (expected === "" || expected === "*") return true;
  if (expected.startsWith("^")) return major(version) === major(expected.slice(1));
  if (expected.startsWith(">=")) {
    const current = version.replace(/^v/, "").split(".").map(Number);
    const minimum = expected.slice(2).trim().replace(/^v/, "").split(".").map(Number);
    for (let index = 0; index < Math.max(current.length, minimum.length); index++) {
      const left = current[index] ?? 0;
      const right = minimum[index] ?? 0;
      if (left !== right) return left > right;
    }
    return true;
  }
  return version.replace(/^v/, "") === expected.replace(/^v/, "");
}

function registerUnique<T extends { name: string }>(registry: Map<string, T>, definition: T, kind: string): void {
  const existing = registry.get(definition.name);
  if (existing === definition) return;
  if (existing) throw new Error(`${kind} "${definition.name}" is already registered.`);
  registry.set(definition.name, definition);
}

function createArchMapWithViews(views: Map<string, ViewRenderer>): ArchMapInstance {
  const elementTypes = new Map<string, ElementTypeDefinition>();
  const relationTypes = new Map<string, RelationTypeDefinition>();
  const validators = new Map<string, ValidatorDefinition>();
  const overlays = new Map<string, NamedDefinition>();
  const policies = new Map<string, NamedDefinition>();
  const serializers = new Map<string, NamedDefinition>();
  const importers = new Map<string, NamedDefinition>();
  const exporters = new Map<string, NamedDefinition>();
  const themes = new Map<string, NamedDefinition>();
  const plugins = new Map<string, InstalledPlugin>();
  let activeInstall: InstalledPlugin | undefined;

  const track = (registry: Map<string, unknown>, name: string): void => {
    activeInstall?.registrations.push({ registry, name });
  };
  const registerNamed = <T extends NamedDefinition>(registry: Map<string, T>, definition: T, kind: string): void => {
    registerUnique(registry, definition, kind);
    track(registry as Map<string, unknown>, definition.name);
  };

  const instance: ArchMapInstance = {
    version: ARCHMAP_VERSION,
    use(plugin) {
      const installed = plugins.get(plugin.name);
      if (installed?.plugin.version === plugin.version) return instance;
      if (installed) throw new Error(`Plugin "${plugin.name}" is already installed at ${installed.plugin.version}; cannot install ${plugin.version}.`);
      for (const conflict of plugin.conflicts ?? []) {
        if (plugins.has(conflict)) throw new Error(`Plugin "${plugin.name}" conflicts with installed plugin "${conflict}".`);
      }
      for (const other of plugins.values()) {
        if (other.plugin.conflicts?.includes(plugin.name)) throw new Error(`Installed plugin "${other.plugin.name}" conflicts with "${plugin.name}".`);
      }
      for (const [dependency, range] of Object.entries(plugin.requires ?? {})) {
        const dependencyVersion = dependency === "@archmap/core" ? ARCHMAP_VERSION : plugins.get(dependency)?.plugin.version;
        if (!dependencyVersion) throw new Error(`Plugin "${plugin.name}" requires missing plugin "${dependency}" (${range}).`);
        if (!satisfies(dependencyVersion, range)) throw new Error(`Plugin "${plugin.name}" requires "${dependency}" ${range}, found ${dependencyVersion}.`);
      }

      const record: InstalledPlugin = { plugin, registrations: [] };
      activeInstall = record;
      try {
        for (const definition of plugin.elementTypes ?? []) instance.registerElementType(definition);
        for (const definition of plugin.relationTypes ?? []) instance.registerRelationType(definition);
        for (const definition of plugin.validators ?? []) instance.registerValidator(definition);
        for (const definition of plugin.views ?? []) instance.registerView(definition.name, definition.renderer);
        for (const definition of plugin.overlays ?? []) instance.registerOverlay(definition);
        for (const definition of plugin.policies ?? []) instance.registerPolicy(definition);
        for (const definition of plugin.serializers ?? []) instance.registerSerializer(definition);
        for (const definition of plugin.importers ?? []) instance.registerImporter(definition);
        for (const definition of plugin.exporters ?? []) instance.registerExporter(definition);
        for (const definition of plugin.themes ?? []) instance.registerTheme(definition);
        const cleanup = plugin.install?.(context);
        record.cleanup = typeof cleanup === "function" ? cleanup : undefined;
        plugins.set(plugin.name, record);
      } catch (error) {
        for (const registration of record.registrations.reverse()) registration.registry.delete(registration.name);
        throw error;
      } finally {
        activeInstall = undefined;
      }
      return instance;
    },
    unuse(name) {
      const record = plugins.get(name);
      if (!record) return false;
      record.cleanup?.();
      for (const registration of record.registrations.reverse()) registration.registry.delete(registration.name);
      plugins.delete(name);
      return true;
    },
    listPlugins: () => [...plugins.values()].map(({ plugin }) => ({ name: plugin.name, version: plugin.version })),
    parse(source) {
      const model = parseCore(source);
      normalizeRegisteredExtensions(model, elementTypes.values(), relationTypes.values());
      for (const validator of validators.values()) {
        const diagnostics = validator.validate(model, { instance });
        for (const item of diagnostics ?? []) {
          const level = item.level ?? item.severity;
          if (level === "error") model.errors.push(item);
          else if (level === "warning") model.warnings.push(item);
          else if (level === "suggestion") model.suggestions.push(item);
          else model.infos.push(item);
        }
      }
      syncDiagnostics(model);
      return model;
    },
    render: (model, options) => renderCore(model, options, views),
    registerElementType(definition) { registerNamed(elementTypes, definition, "Element type"); },
    registerRelationType(definition) { registerNamed(relationTypes, definition, "Relation type"); },
    registerValidator(definition) { registerNamed(validators, definition, "Validator"); },
    registerView(name, renderer) {
      if (views.has(name)) throw new Error(`View "${name}" is already registered.`);
      views.set(name, renderer);
      track(views as Map<string, unknown>, name);
    },
    registerOverlay(definition) { registerNamed(overlays, definition, "Overlay"); },
    registerPolicy(definition) { registerNamed(policies, definition, "Policy"); },
    registerSerializer(definition) { registerNamed(serializers, definition, "Serializer"); },
    registerImporter(definition) { registerNamed(importers, definition, "Importer"); },
    registerExporter(definition) { registerNamed(exporters, definition, "Exporter"); },
    registerTheme(definition) { registerNamed(themes, definition, "Theme"); },
    getElementType: (name) => elementTypes.get(name),
    getRelationType: (name) => relationTypes.get(name),
    getView: (name) => views.get(name),
    listElementTypes: () => [...elementTypes.keys()],
    listRelationTypes: () => [...relationTypes.keys()],
    listValidators: () => [...validators.keys()],
    listViews: () => [...views.keys()],
  };

  const context: PluginContext = {
    instance,
    registerElementType: (definition) => instance.registerElementType(definition),
    registerRelationType: (definition) => instance.registerRelationType(definition),
    registerValidator: (definition) => instance.registerValidator(definition),
    registerView: (name, renderer) => instance.registerView(name, renderer),
    registerOverlay: (definition) => instance.registerOverlay(definition),
    registerPolicy: (definition) => instance.registerPolicy(definition),
    registerSerializer: (definition) => instance.registerSerializer(definition),
    registerImporter: (definition) => instance.registerImporter(definition),
    registerExporter: (definition) => instance.registerExporter(definition),
    registerTheme: (definition) => instance.registerTheme(definition),
  };

  return instance;
}

export function createArchMap(): ArchMapInstance {
  const views = new Map<string, ViewRenderer>();
  for (const name of listDefaultViews()) {
    const renderer = getDefaultView(name);
    if (renderer) views.set(name, renderer);
  }
  return createArchMapWithViews(views);
}

export const defaultArchMap = createArchMapWithViews(getDefaultViewRegistry());

export function use(plugin: ArchMapPlugin): ArchMapInstance {
  return defaultArchMap.use(plugin);
}

export function parse(source: string): ArchMapModel {
  return defaultArchMap.parse(source);
}

export const registerElementType = defaultArchMap.registerElementType;
export const registerRelationType = defaultArchMap.registerRelationType;
export const registerValidator = defaultArchMap.registerValidator;
export const registerPolicy = defaultArchMap.registerPolicy;
export const registerSerializer = defaultArchMap.registerSerializer;
export const registerImporter = defaultArchMap.registerImporter;
export const registerExporter = defaultArchMap.registerExporter;
export const registerOverlay = defaultArchMap.registerOverlay;
export const registerTheme = defaultArchMap.registerTheme;
