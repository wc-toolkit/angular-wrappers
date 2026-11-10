# WC Toolkit Angular Wrappers

![WC Toolkit Angular Wrappers](./images/wc-toolkit_angular.png)

This package generates Angular wrapper components for your web components from a [Custom Elements Manifest](https://custom-elements-manifest.open-wc.org/) (CEM). It is the Angular counterpart to `@wc-toolkit/react-wrappers`.

See the [Angular Wrappers documentation](https://wc-toolkit.com/integrations/angular/) for the guide and examples.

Angular has no equivalent of JSX's `IntrinsicElements`, so raw custom element tags in templates can't be given types. Each generated wrapper is a standalone Angular component whose selector is your element's tag name. Its inputs and outputs are typed from the element class, so template bindings are type-checked and documented.

## Installation

```bash
npm install -D @wc-toolkit/angular-wrappers
```

Requires Angular 16.1 or later.

## Quick Start

This package provides plugins and tools to quickly generate wrappers.

### 1) CEM Generator Plugin

If you are using the [CEM Generator](https://cem-generator.wc-toolkit.com/), this library provides a plugin to get quickly set up and keep in sync with your CEM.

1. Add `angularWrappersGeneratorPlugin(...)` to `cem-generator.config.*`.
2. Run `cem generate`.
3. Use files emitted to `outdir`.

```js
// cem-generator.config.mjs
import { angularWrappersGeneratorPlugin } from "@wc-toolkit/angular-wrappers";

export default {
  plugins: [angularWrappersGeneratorPlugin()],
};
```

### 2) CEM Analyzer Plugin

If you already run the [CEM Analyzer](https://custom-elements-manifest.open-wc.org/analyzer/getting-started/) directly, use this.

1. Add `angularWrappersAnalyzerPlugin(...)` to `custom-elements-manifest.config.*`.
2. Run `cem analyze`.
3. Use files emitted to `outdir`.

```js
// custom-elements-manifest.config.mjs
import { angularWrappersAnalyzerPlugin } from "@wc-toolkit/angular-wrappers";

export default {
  plugins: [angularWrappersAnalyzerPlugin()],
};
```

### 3) Programmatic Usage

Use this when wrappers are part of a custom build script.

1. Load your manifest object.
2. Call `generateAngularWrappers(...)`.
3. Consume generated files from `outdir`.

```ts
import manifest from "./custom-elements.json" with { type: "json" };
import { generateAngularWrappers } from "@wc-toolkit/angular-wrappers";

generateAngularWrappers(manifest, {...});
```

## Using Generated Wrappers

Generated output is written to `outdir`:

```
angular/
├── index.ts        # Barrel export of all wrappers
├── MyButton.ts     # One standalone component per custom element
└── MyInput.ts
```

Import a wrapper and add it to a component's `imports`:

```ts
import { Component } from "@angular/core";
import { MyButton } from "./angular";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [MyButton],
  template: `
    <my-button
      [variant]="variant"
      [disabled]="isSaving"
      (myClick)="onClick($event)"
    >
      Save
    </my-button>
  `,
})
export class AppComponent {
  variant: "primary" | "secondary" = "primary";
  isSaving = false;

  onClick(event: CustomEvent<{ count: number }>) {
    console.log(event.detail.count);
  }
}
```

Each generated wrapper:

- Declares a standalone component whose selector is the element's tag name, so the rendered host is the custom element itself and projected content renders as light DOM children.
- Imports the element module for registration and for its types.
- Exposes an `@Input()` for every documented attribute, property, and global prop. Types come from the element class, and JSDoc comes from the manifest.
- Coerces boolean attributes with `booleanAttribute`, so `<my-button disabled>` and `[disabled]="true"` both work.
- Exposes an `@Output()` for every custom event. Event names are camelCased (`my-click` becomes `myClick`). Typed event details come from the manifest.
- Removes its event listeners when the component is destroyed.

### Using Generated Output

The generated files are TypeScript source. Compile them with your library build (for example `ng-packagr`), or copy them into the app that consumes them.

## Configuration Options

| Option                   | Type                                             | Default                      | Description                                                                     |
| ------------------------ | ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------- |
| `outdir`                 | `string`                                         | `"./angular"`                | Output directory for generated files                                            |
| `packageJsonPath`        | `string`                                         | `process.cwd()/package.json` | Path used to resolve fallback module imports when CEM module paths are remapped |
| `modulePath`             | `(className, tagName, cemModulePath?) => string` | CEM module path              | Transform or replace the import path of the element module                      |
| `defaultExport`          | `boolean`                                        | `false`                      | Import the element class as a default export                                    |
| `stronglyTypedEvents`    | `boolean`                                        | `true`                       | Generate `<Component><Event>ElementEvent` aliases whose `target` is the element |
| `ssrSafe`                | `boolean`                                        | `false`                      | Browser-gate event wiring and load custom elements with dynamic import          |
| `attributeMapping`       | `Record<string, string>`                         | `{}`                         | Rename attributes to input names. Required for reserved names such as `class`   |
| `globalProps`            | `MappedAttribute[]`                              | `[]`                         | Inputs added to every wrapper                                                   |
| `globalEvents`           | `GlobalEvent[]`                                  | `[]`                         | Outputs added to every wrapper                                                  |
| `componentNameFormatter` | `(tagName, componentName) => string`             | `undefined`                  | Customize the generated class and file names                                    |
| `exclude`                | `string[]`                                       | `[]`                         | Component class names to skip                                                   |
| `descriptionSrc`         | `"description" \| "summary"`                     | `"description"`              | Manifest field used for component documentation                                 |
| `debug`                  | `boolean`                                        | `false`                      | Enable detailed logging                                                         |
| `failOnWarnings`         | `boolean`                                        | `false`                      | Treat generation warnings as errors (recommended in CI)                         |
| `skip`                   | `boolean`                                        | `false`                      | Skip generation (useful for conditional execution)                              |

### Why `packageJsonPath` matters

When wrappers are generated from tooling outside the package that owns your element source (for example, monorepos, custom scripts, or nonstandard output folders), fallback import resolution can point at the wrong package root.

Set `packageJsonPath` to the owning package's `package.json` to keep generated module imports stable and correct across local runs and CI.

### Class Export Resolution and Fallbacks

Wrappers always import the custom element module for side effects (`customElements.define(...)`).
For element class typing, the generator checks what the module actually exports:

- If `defaultExport: true` and a default export exists, it uses that.
- If a default export is requested but not present, it falls back to a named export when available.
- If no importable class export is available, it falls back to `HTMLUnknownElement` typing instead of failing generation.

This fallback is especially useful for CSS-only or atypical manifests that define a tag but do not export a class symbol the wrapper can import.

### SSR Safety

Set `ssrSafe: true` to generate wrappers that are friendlier to Angular SSR:

- custom element modules are loaded in the browser (`import(...)`) instead of top-level side-effect imports
- event listeners are only attached in the browser

This keeps server rendering from eagerly running client-only custom element code.

### Reserved Attribute Names

Attributes named `class`, `for`, `style`, or `children` collide with HTML or Angular names. Generation fails for them unless you map them:

```js
angularWrappersAnalyzerPlugin({
  attributeMapping: { class: "cssClass" },
});
```

The wrapper then exposes a `cssClass` input that sets the element's `className`.

### Global Props and Events

```ts
generateAngularWrappers(manifest, {
  globalProps: [
    {
      name: "theme",
      description: "The theme applied to the component.",
      type: { text: '"light" | "dark"' },
    },
  ],
  globalEvents: [
    {
      event: "themeChange",
      description: "Fires when the theme changes.",
      type: "CustomEvent<string>",
    },
  ],
});
```

## Limitations

- Angular template checking only covers components that are imported. Raw tags for elements without a wrapper still need `CUSTOM_ELEMENTS_SCHEMA`.
- Generated code is only as accurate as the manifest. Undocumented members are skipped, as in `react-wrappers`.

## Troubleshooting

### No wrapper files were generated

- Confirm `skip` is not set to `true`.
- Confirm your manifest contains declarations with both `tagName` and `customElement: true`.
- Run with `debug: true` to print generation logs.

### Generation fails on reserved attribute names

Attributes such as `class`, `for`, `style`, and `children` must be remapped using `attributeMapping`.

### `failOnWarnings` starts failing CI

This usually means a component could not resolve an importable class export and fell back to `HTMLUnknownElement` typing.

- Ensure the class is exported from the module referenced by the manifest.
- If your class is default-exported, set `defaultExport: true`.

### Event names look different in Angular templates

Custom event names are exposed as camelCased outputs (`my-click` becomes `myClick`).

## Demo

The `demo/` folder contains an Angular CLI app that uses generated wrappers for a sample `<my-button>` element.

```bash
pnpm install
pnpm demo        # analyze demo/app/src/elements, then generate wrappers into demo/app/src/app/wrappers
pnpm demo:app    # generate, then run ng serve on http://localhost:4200
```

`pnpm demo` regenerates `demo/custom-elements.json` and the wrappers, so run it again after editing the element.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
