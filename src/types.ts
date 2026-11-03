import type { Attribute } from "custom-elements-manifest";

export interface AngularWrapperOptions {
  /** Used to get a specific path for a given component. Defaults to the resolved module path in the CEM. */
  modulePath?: (
    className: string,
    tagName: string,
    cemModulePath?: string,
  ) => string;
  /** Path to output directory */
  outdir?: string;
  /** Optional path to package.json used to resolve the fallback module import path. Defaults to process.cwd()/package.json. */
  packageJsonPath?: string;
  /** Indicates if the component classes are a default export rather than a named export */
  defaultExport?: boolean;
  /** Creates event types where the event's target is typed as the custom element */
  stronglyTypedEvents?: boolean;
  /** Used to provide alternative input names to prevent name collisions with Angular or HTML attributes */
  attributeMapping?: { [key: string]: string };
  /** Used to add custom global inputs to all component wrappers */
  globalProps?: MappedAttribute[];
  /** Used to add custom global outputs to all component wrappers */
  globalEvents?: GlobalEvent[];
  /** Optional function to format the Angular component class names. Defaults to the component class name. */
  componentNameFormatter?: (tagName: string, componentName: string) => string;
  /** Class names of any components you would like to exclude from the wrappers */
  exclude?: string[];
  /** The property name from the component object that you would like to use for the description of your component */
  descriptionSrc?: "description" | "summary" | (string & {});
  /** Show debug logs produced by the plugin */
  debug?: boolean;
  /** Treat warnings as errors and stop generation */
  failOnWarnings?: boolean;
  /** Prevents plugin from executing */
  skip?: boolean;
}

export interface AngularWrapperResult {
  outdir: string;
  generatedFiles: string[];
  removedFiles: string[];
  componentCount: number;
  warningCount: number;
  skipped: boolean;
}

export interface GlobalEvent {
  event: string;
  description: string;
  type: string;
}

export interface MappedAttribute extends Attribute {
  originalName?: string;
  propName?: string;
}

export interface ComponentAttributes {
  attributes: MappedAttribute[];
  booleanAttributes: MappedAttribute[];
}

export interface EventName {
  name: string;
  outputName: string;
  description?: string;
  type?: string;
}
