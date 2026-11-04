import fs from "fs";
import path from "path";
import {
  getAllComponents,
  getComponentDetailsTemplate,
  getCustomEventDetailTypes,
  toPascalCase,
} from "@wc-toolkit/cem-utilities";
import type { Component } from "@wc-toolkit/cem-utilities";
import type { Attribute, ClassField, Package } from "custom-elements-manifest";
import { RESERVED_WORDS, getModulePath, toInputName } from "./angular-utils.js";
import { Logger } from "./logger.js";
import { createOutDir, has, saveFile } from "./utils.js";
import type {
  AngularWrapperOptions,
  AngularWrapperResult,
  ComponentAttributes,
  EventName,
  MappedAttribute,
} from "./types.js";

const TRACKER_FILE = ".angular-wrappers.generated.json";

interface GenerationContext {
  config: AngularWrapperOptions;
  log: Logger;
  exportIndex: Map<string, ModuleExportInfo>;
  warnings: string[];
}

interface ModuleExportInfo {
  named: Set<string>;
  hasDefault: boolean;
}

interface ElementTypeResolution {
  useUnknownElementType: boolean;
  exportKind: "named" | "default" | null;
}

type InputStrategy = "property" | "attribute";

interface InputDescriptor {
  name: string;
  alias?: string;
  type: string;
  description?: string;
  boolean?: boolean;
  strategy: InputStrategy;
  hostProperty?: string;
  attributeName?: string;
  source: "attribute" | "property" | "global";
}

interface OutputDescriptor {
  eventName: string;
  outputName: string;
  type: string;
  description?: string;
  source: "event" | "global";
}

export function generateAngularWrappers(
  customElementsManifest: unknown,
  options: AngularWrapperOptions = {},
): AngularWrapperResult {
  const manifest = customElementsManifest as Package;
  const context = createContext(manifest, options);
  if (context.config.skip) {
    context.log.yellow("[angular-wrappers] - Skipped");
    return {
      outdir: context.config.outdir!,
      generatedFiles: [],
      removedFiles: [],
      componentCount: 0,
      warningCount: 0,
      skipped: true,
    };
  }

  context.log.default("[angular-wrappers] - Generating wrappers...");

  // `getAllComponents` caches by manifest contents and ignores `exclude` on a
  // cache hit, so filter here instead of passing `exclude` through.
  const components = getAllComponents(manifest).filter(
    (component) => !context.config.exclude?.includes(component.name),
  );

  createOutDir(context.config.outdir!);

  const generatedFiles = new Set<string>(["index.ts"]);
  components.forEach((component) => {
    generatedFiles.add(`${getComponentName(context, component)}.ts`);
  });
  const removedFiles = deleteStaleGeneratedFiles(
    context.config.outdir!,
    generatedFiles,
  );

  components.forEach((component) => {
    const events = getEventNames(component);
    const { booleanAttributes, attributes } = getAttributes(context, component);
    const properties = getProperties(component, [
      ...attributes,
      ...booleanAttributes,
    ]);
    const modulePath = getModulePath(
      context.config.modulePath,
      component,
      context.config.outdir!,
      context.config.packageJsonPath,
    );

    saveFile(
      context.config.outdir!,
      `${getComponentName(context, component)}.ts`,
      getComponentTemplate(
        context,
        component,
        events,
        booleanAttributes,
        attributes,
        properties,
        modulePath,
      ),
    );
  });

  saveFile(
    context.config.outdir!,
    "index.ts",
    getBarrelTemplate(context, components),
  );
  writeGeneratedTracker(context.config.outdir!, [...generatedFiles]);
  context.log.default(
    `[angular-wrappers] - Generated wrappers in "${context.config.outdir}".`,
  );

  return {
    outdir: context.config.outdir!,
    generatedFiles: [...generatedFiles].sort(),
    removedFiles,
    componentCount: components.length,
    warningCount: context.warnings.length,
    skipped: false,
  };
}

function createContext(
  manifest: Package,
  options: AngularWrapperOptions,
): GenerationContext {
  const config: AngularWrapperOptions = {
    outdir: "./angular",
    stronglyTypedEvents: true,
    ssrSafe: false,
    exclude: [],
    attributeMapping: {},
    globalProps: [],
    globalEvents: [],
    ...options,
  };

  return {
    config,
    log: new Logger(options.debug),
    exportIndex: createExportIndex(manifest),
    warnings: [],
  };
}

function warn(context: GenerationContext, message: string) {
  context.warnings.push(message);
  context.log.yellow(message);
  if (context.config.failOnWarnings) {
    throw new Error(
      `[angular-wrappers] Warning treated as error because failOnWarnings is enabled: ${message}`,
    );
  }
}

function isCssOnlyComponent(component: Component) {
  return component.superclass?.name === "HTMLUnknownElement";
}

function isValidIdentifier(value?: string) {
  return !!value && /^[$A-Z_][0-9A-Z_$]*$/i.test(value);
}

function createExportIndex(manifest: Package): Map<string, ModuleExportInfo> {
  const index = new Map<string, ModuleExportInfo>();

  (manifest.modules || []).forEach((moduleDoc) => {
    const modulePath = moduleDoc.path;
    if (!modulePath) {
      return;
    }

    const info: ModuleExportInfo = {
      named: new Set<string>(),
      hasDefault: false,
    };

    (moduleDoc.exports || []).forEach((entry) => {
      if (entry.kind !== "js") {
        return;
      }

      if (entry.name === "default") {
        info.hasDefault = true;
      }

      if (entry.name) {
        info.named.add(entry.name);
      }

      const declarationName = entry.declaration?.name;
      if (declarationName) {
        info.named.add(declarationName);
      }
    });

    index.set(modulePath, info);
  });

  return index;
}

function resolveElementType(
  context: GenerationContext,
  component: Component,
): ElementTypeResolution {
  if (isCssOnlyComponent(component) || !isValidIdentifier(component.name)) {
    return {
      useUnknownElementType: true,
      exportKind: null,
    };
  }

  const exports = component.modulePath
    ? context.exportIndex.get(component.modulePath)
    : undefined;
  const hasNamed = !!(exports && exports.named.has(component.name));
  const hasDefault = !!exports?.hasDefault;

  if (context.config.defaultExport && hasDefault) {
    return { useUnknownElementType: false, exportKind: "default" };
  }

  if (!context.config.defaultExport && hasNamed) {
    return { useUnknownElementType: false, exportKind: "named" };
  }

  if (hasNamed) {
    return { useUnknownElementType: false, exportKind: "named" };
  }

  if (hasDefault) {
    return { useUnknownElementType: false, exportKind: "default" };
  }

  warn(
    context,
    `[angular-wrappers] - ${component.tagName} (${component.name}) has no importable class export in ${component.modulePath || "its module"}. Falling back to HTMLUnknownElement typing.`,
  );

  return {
    useUnknownElementType: true,
    exportKind: null,
  };
}

function getComponentName(context: GenerationContext, component: Component) {
  return (
    context.config.componentNameFormatter?.(
      component.tagName!,
      component.name,
    ) ||
    (isCssOnlyComponent(component)
      ? toPascalCase(component.tagName!)
      : component.name)
  );
}

function getEventNames(component: Component): EventName[] {
  return (
    component?.events
      ?.filter((event) => event.name)
      ?.map((event) => ({
        name: event.name,
        outputName: toInputName(event.name),
        description: event.description,
        type: event.type?.text,
      })) || []
  );
}

function getAttributes(
  context: GenerationContext,
  component: Component,
): ComponentAttributes {
  const result: ComponentAttributes = {
    attributes: [],
    booleanAttributes: [],
  };

  component?.attributes?.forEach((attr) => {
    if (!attr?.name) {
      return;
    }

    if (attr.name in context.config.attributeMapping!) {
      addAttribute(getMappedAttribute(context, attr), result);
      return;
    }

    if (RESERVED_WORDS.includes(attr.name)) {
      throwKeywordException(attr, component);
    }

    addAttribute(attr as MappedAttribute, result);
  });

  return result;
}

function throwKeywordException(attr: Attribute, component: Component) {
  throw new Error(
    `Attribute \`${attr.name}\` in custom element \`${component.name}\` is a reserved keyword and cannot be used. Please provide an \`attributeMapping\` in the plugin options to rename the Angular input that gets bound to the attribute.`,
  );
}

function getMappedAttribute(
  context: GenerationContext,
  attr: Attribute,
): MappedAttribute {
  return {
    ...attr,
    originalName: attr.name,
    name: context.config.attributeMapping![attr.name],
  };
}

function addAttribute(
  attribute: MappedAttribute,
  componentAttributes: ComponentAttributes,
) {
  const originalName = attribute.originalName ?? attribute.name;
  attribute.propName = attribute.propName || toInputName(attribute.name);
  attribute.fieldName = attribute.fieldName || toInputName(originalName);

  const taken = getTakenNames([
    ...componentAttributes.attributes,
    ...componentAttributes.booleanAttributes,
  ]);

  if (taken.has(attribute.propName)) {
    return;
  }

  const target = attribute.type?.text?.includes("boolean")
    ? componentAttributes.booleanAttributes
    : componentAttributes.attributes;

  target.push(attribute);
}

function getTakenNames(attributes: Array<Partial<MappedAttribute>>) {
  return new Set(
    attributes.flatMap((attr) =>
      [attr.name, attr.fieldName, attr.propName].filter(
        (name): name is string => Boolean(name),
      ),
    ),
  );
}

function getPublicFieldNames(component: Component): Set<string> {
  return new Set(
    (component.members || [])
      .filter(
        (member) =>
          member.kind === "field" &&
          !member.static &&
          member.privacy !== "private" &&
          member.privacy !== "protected" &&
          !!member.name,
      )
      .map((member) => member.name as string),
  );
}

function getProperties(
  component: Component,
  attributes: MappedAttribute[],
): ClassField[] {
  const taken = getTakenNames(attributes);

  return (component?.members?.filter(
    (member) =>
      member.kind === "field" &&
      !member.static &&
      member.privacy !== "private" &&
      member.privacy !== "protected" &&
      !!member.name &&
      !taken.has(member.name) &&
      (member.description || member.deprecated),
  ) || []) as ClassField[];
}

function getEventDetailType(eventType?: string) {
  if (!eventType) {
    return "CustomEvent";
  }

  if (eventType === "Event") {
    return "Event";
  }

  if (eventType === "CustomEvent") {
    return "CustomEvent";
  }

  if (/^(Custom)?Event\b/.test(eventType)) {
    return eventType;
  }

  return `CustomEvent<${eventType}>`;
}

function getEmitType(
  context: GenerationContext,
  componentName: string,
  event: EventName,
) {
  if (context.config.stronglyTypedEvents) {
    return `${componentName}${toPascalCase(event.name)}ElementEvent`;
  }

  return getEventDetailType(event.type);
}

// `getCustomEventDetailTypes` only collects detail types written bare; it skips
// anything containing `<`/`>`, so a `CustomEvent<MyDetail>` event leaves
// `MyDetail` referenced by the generated types but never imported. Recover the
// inner type from those wrapped events too. Only a single identifier is taken,
// since unions, nested generics, arrays and namespaced shapes have no single
// importable name.
function getEventDetailImportTypes(component: Component): string[] {
  const bare = getCustomEventDetailTypes(component);
  const wrapped = (component?.events ?? [])
    .map((event) =>
      /^CustomEvent<(.+)>$/.exec(event.type?.text ?? "")?.[1]?.trim(),
    )
    .filter(
      (detail): detail is string =>
        detail !== undefined && /^[A-Z][\w$]*$/.test(detail),
    );
  return [...new Set([...bare, ...wrapped])];
}

function getAttributeAlias(attributeName: string, inputName: string) {
  return attributeName.includes("-") && attributeName !== inputName
    ? attributeName
    : undefined;
}

function getInputs(
  context: GenerationContext,
  component: Component,
  componentName: string,
  useUnknownElementType: boolean,
  booleanAttributes: MappedAttribute[],
  attributes: MappedAttribute[],
  properties: ClassField[],
): InputDescriptor[] {
  const elementName = `${componentName}Element`;
  const elementType = (property: string, fallback?: string) =>
    useUnknownElementType
      ? fallback || "string"
      : `${elementName}["${property}"]`;
  const memberNames = getPublicFieldNames(component);

  const fromAttributes = [
    ...booleanAttributes.map((attr): InputDescriptor => {
      const attributeName = attr.originalName ?? attr.name;
      const hostProperty = attr.fieldName!;
      const memberBacked = memberNames.has(hostProperty);

      return {
        name: attr.propName!,
        alias: getAttributeAlias(attributeName, attr.propName!),
        type: "boolean",
        description: attr.description,
        boolean: true,
        strategy: memberBacked ? "property" : "attribute",
        hostProperty,
        attributeName,
        source: "attribute",
      };
    }),
    ...attributes.map((attr): InputDescriptor => {
      const attributeName = attr.originalName ?? attr.name;
      const hostProperty = attr.fieldName!;
      const memberBacked = memberNames.has(hostProperty);

      return {
        name: attr.propName!,
        alias: getAttributeAlias(attributeName, attr.propName!),
        type: memberBacked
          ? elementType(hostProperty, attr.type?.text)
          : attr.type?.text || "string",
        description: attr.description,
        strategy: memberBacked ? "property" : "attribute",
        hostProperty,
        attributeName,
        source: "attribute",
      };
    }),
  ];

  const fromProperties = properties.map(
    (prop): InputDescriptor => ({
      name: prop.name,
      type: elementType(prop.name, prop.type?.text),
      description: prop.description,
      strategy: "property",
      hostProperty: prop.name,
      source: "property",
    }),
  );

  const fromGlobals = (context.config.globalProps || []).map(
    (prop): InputDescriptor => ({
      name: prop.name,
      type: prop.type?.text || "string",
      description: prop.description,
      strategy: "property",
      hostProperty: prop.fieldName || prop.name,
      source: "global",
    }),
  );

  return [...fromAttributes, ...fromProperties, ...fromGlobals];
}

function getOutputs(
  context: GenerationContext,
  componentName: string,
  events: EventName[],
): OutputDescriptor[] {
  return [
    ...events.map(
      (event): OutputDescriptor => ({
        eventName: event.name,
        outputName: event.outputName,
        type: getEmitType(context, componentName, event),
        description: event.description,
        source: "event",
      }),
    ),
    ...(context.config.globalEvents || []).map(
      (event): OutputDescriptor => ({
        eventName: event.event,
        outputName: event.event,
        type: event.type,
        description: event.description,
        source: "global",
      }),
    ),
  ];
}

function assertNoInputCollisions(
  componentName: string,
  inputs: InputDescriptor[],
) {
  const names = new Map<string, string>();
  const aliases = new Map<string, string>();

  inputs.forEach((input) => {
    const existingByName = names.get(input.name);
    if (existingByName) {
      throw new Error(
        `[angular-wrappers] Duplicate input \`${input.name}\` for component \`${componentName}\` from ${existingByName} and ${input.source}.`,
      );
    }
    names.set(input.name, input.source);

    if (input.alias) {
      const existingByAlias = aliases.get(input.alias);
      if (existingByAlias) {
        throw new Error(
          `[angular-wrappers] Duplicate input alias \`${input.alias}\` for component \`${componentName}\` from ${existingByAlias} and ${input.source}.`,
        );
      }
      aliases.set(input.alias, input.source);
    }
  });
}

function assertNoOutputCollisions(
  componentName: string,
  outputs: OutputDescriptor[],
) {
  const outputNames = new Map<string, string>();
  const eventNames = new Map<string, string>();

  outputs.forEach((output) => {
    const existingByOutput = outputNames.get(output.outputName);
    if (existingByOutput) {
      throw new Error(
        `[angular-wrappers] Duplicate output \`${output.outputName}\` for component \`${componentName}\` from ${existingByOutput} and ${output.source}.`,
      );
    }
    outputNames.set(output.outputName, output.source);

    const existingByEvent = eventNames.get(output.eventName);
    if (existingByEvent) {
      throw new Error(
        `[angular-wrappers] Duplicate event binding \`${output.eventName}\` for component \`${componentName}\` from ${existingByEvent} and ${output.source}.`,
      );
    }
    eventNames.set(output.eventName, output.source);
  });
}

function docs(description?: string) {
  return description ? `/** ${description} */` : "";
}

function getInputDecorator(input: InputDescriptor) {
  if (!input.alias && !input.boolean) {
    return "@Input()";
  }

  const props: string[] = [];
  if (input.alias) {
    props.push(`alias: "${input.alias}"`);
  }
  if (input.boolean) {
    props.push("transform: booleanAttribute");
  }

  return `@Input({ ${props.join(", ")} })`;
}

function getInputGetter(input: InputDescriptor) {
  if (input.strategy === "property") {
    return `return this.elementRef.nativeElement.${input.hostProperty};`;
  }

  if (input.boolean) {
    return `return this.elementRef.nativeElement.hasAttribute("${input.attributeName}");`;
  }

  return `return this.elementRef.nativeElement.getAttribute("${input.attributeName}") as unknown as ${input.type};`;
}

function getInputSetter(input: InputDescriptor) {
  if (input.strategy === "property") {
    return `this.elementRef.nativeElement.${input.hostProperty} = value;`;
  }

  if (input.boolean) {
    return `this.elementRef.nativeElement.toggleAttribute("${input.attributeName}", Boolean(value));`;
  }

  return `
    if (value === undefined || value === null) {
      this.elementRef.nativeElement.removeAttribute("${input.attributeName}");
      return;
    }
    this.elementRef.nativeElement.setAttribute("${input.attributeName}", String(value));
  `;
}

function getInputTemplate(input: InputDescriptor) {
  return `
    ${docs(input.description)}
    ${getInputDecorator(input)}
    get ${input.name}(): ${input.type} {
      ${getInputGetter(input)}
    }
    set ${input.name}(value: ${input.type}) {
      ${getInputSetter(input)}
    }
  `;
}

function getOutputTemplate(output: OutputDescriptor) {
  return `
    ${docs(output.description)}
    @Output() readonly ${output.outputName} = new EventEmitter<${output.type}>();
  `;
}

function getConstructorTemplate(
  context: GenerationContext,
  modulePath: string,
  outputs: OutputDescriptor[],
) {
  const needsConstructor = context.config.ssrSafe || has(outputs);
  if (!needsConstructor) {
    return "";
  }

  const setupImport = context.config.ssrSafe
    ? `
      if (this.isBrowser) {
        void import("${modulePath}");
      }
    `
    : "";

  if (!has(outputs)) {
    return `
      constructor() {
        ${setupImport}
      }
    `;
  }

  const listeners = outputs
    .map(
      (output) =>
        `["${output.eventName}", (event) => this.${output.outputName}.emit(event as ${output.type})]`,
    )
    .join(",\n");

  return `
    constructor() {
      ${setupImport}
      ${context.config.ssrSafe ? "if (!this.isBrowser) { return; }" : ""}
      const element = this.elementRef.nativeElement;
      const listeners: Array<[string, (event: Event) => void]> = [
        ${listeners}
      ];

      const cleanup = listeners.map(([type, listener]) => {
        element.addEventListener(type, listener);
        return () => element.removeEventListener(type, listener);
      });

      this.destroyRef.onDestroy(() => {
        cleanup.forEach((remove) => remove());
      });
    }
  `;
}

function getStronglyTypedEvents(
  context: GenerationContext,
  componentName: string,
  events: EventName[],
): string {
  if (!context.config.stronglyTypedEvents || !has(events)) {
    return "";
  }

  return [
    `/** Custom event with its target typed as \`${componentName}Element\` */
    export type ${componentName}ElementEvent<E extends Event = CustomEvent> = E & {
      target: ${componentName}Element;
    };`,
    ...events.map(
      (event) =>
        `/** \`${event.name}\` event type */
    export type ${componentName}${toPascalCase(event.name)}ElementEvent = ${componentName}ElementEvent<${getEventDetailType(event.type)}>;`,
    ),
  ].join("\n");
}

function getComponentTemplate(
  context: GenerationContext,
  component: Component,
  events: EventName[],
  booleanAttributes: MappedAttribute[],
  attributes: MappedAttribute[],
  properties: ClassField[],
  modulePath: string,
) {
  const componentName = getComponentName(context, component);
  const elementType = resolveElementType(context, component);
  const inputs = getInputs(
    context,
    component,
    componentName,
    elementType.useUnknownElementType,
    booleanAttributes,
    attributes,
    properties,
  );
  const outputs = getOutputs(context, componentName, events);

  assertNoInputCollisions(componentName, inputs);
  assertNoOutputCollisions(componentName, outputs);

  const detailTypes = elementType.useUnknownElementType
    ? []
    : getEventDetailImportTypes(component);
  const angularImports = [
    "ChangeDetectionStrategy",
    "Component",
    "ElementRef",
    "inject",
    has(inputs) ? "Input" : "",
    has(inputs.filter((input) => input.boolean)) ? "booleanAttribute" : "",
    has(outputs) ? "Output" : "",
    has(outputs) ? "EventEmitter" : "",
    has(outputs) ? "DestroyRef" : "",
    context.config.ssrSafe ? "PLATFORM_ID" : "",
  ].filter(Boolean);
  const commonImports = context.config.ssrSafe
    ? 'import { isPlatformBrowser } from "@angular/common";'
    : "";
  const elementImport = elementType.useUnknownElementType
    ? `export type ${componentName}Element = HTMLUnknownElement;`
    : context.config.ssrSafe
      ? `
    import type {
      ${elementType.exportKind === "default" ? "default" : component.name} as ${componentName}Element
    } from "${modulePath}";
    export type { ${componentName}Element${detailTypes.map((type) => `, ${type}`).join("")} };`
      : `
    import {
      ${elementType.exportKind === "default" ? "default" : component.name} as ${componentName}Element
    } from "${modulePath}";
    export type { ${componentName}Element${detailTypes.map((type) => `, ${type}`).join("")} };`;

  return `
    import { ${angularImports.join(", ")} } from "@angular/core";
    ${commonImports}
    ${context.config.ssrSafe ? "" : `import "${modulePath}";`}
    ${has(detailTypes) ? `import type { ${detailTypes.join(", ")} } from "${modulePath}";` : ""}
    ${elementImport}

    ${getStronglyTypedEvents(context, componentName, events)}

    /**
     ${getComponentDetailsTemplate(component, context.config, true)}
     */
    @Component({
      selector: "${component.tagName}",
      standalone: true,
      template: "<ng-content></ng-content>",
      changeDetection: ChangeDetectionStrategy.OnPush,
    })
    export class ${componentName} {
      private readonly elementRef = inject<ElementRef<${componentName}Element>>(ElementRef);
      ${context.config.ssrSafe ? "private readonly platformId = inject(PLATFORM_ID);" : ""}
      ${context.config.ssrSafe ? "private readonly isBrowser = isPlatformBrowser(this.platformId);" : ""}
      ${has(outputs) ? "private readonly destroyRef = inject(DestroyRef);" : ""}
      ${outputs.map(getOutputTemplate).join("")}
      ${getConstructorTemplate(context, modulePath, outputs)}
      ${inputs.map(getInputTemplate).join("")}
    }
  `;
}

function getBarrelTemplate(
  context: GenerationContext,
  components: Component[],
) {
  return components
    .map(
      (component) =>
        `export * from "./${getComponentName(context, component)}.js";`,
    )
    .join("\n");
}

function readGeneratedTracker(outdir: string): string[] {
  const trackerPath = path.join(outdir, TRACKER_FILE);
  if (!fs.existsSync(trackerPath)) {
    return [];
  }

  try {
    const contents = JSON.parse(fs.readFileSync(trackerPath, "utf8")) as {
      files?: unknown;
    };
    return Array.isArray(contents.files)
      ? contents.files.filter(
          (file): file is string => typeof file === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function writeGeneratedTracker(outdir: string, files: string[]) {
  const trackerPath = path.join(outdir, TRACKER_FILE);
  fs.writeFileSync(
    trackerPath,
    JSON.stringify({ files: [...new Set(files)].sort() }, null, 2),
  );
}

function deleteStaleGeneratedFiles(outdir: string, nextFiles: Set<string>) {
  const previousFiles = readGeneratedTracker(outdir);
  const removedFiles = previousFiles
    .filter((file) => !nextFiles.has(file))
    .filter((file) => {
      const targetPath = path.join(outdir, file);
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { force: true });
        return true;
      }
      return false;
    });
  return removedFiles;
}
