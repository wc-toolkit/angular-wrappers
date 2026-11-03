# WC Toolkit Angular Wrappers

This package generates Angular wrapper components for your web components from a [Custom Elements Manifest](https://custom-elements-manifest.open-wc.org/) (CEM). It is the Angular counterpart to `@wc-toolkit/react-wrappers`.

Angular has no equivalent of JSX's `IntrinsicElements`, so raw custom element tags in templates can't be given types. Each generated wrapper is a standalone Angular component whose selector is your element's tag name. Its inputs and outputs are typed from the element class, so template bindings are type-checked and documented.

## Installation

```bash
npm install -D @wc-toolkit/angular-wrappers
```

Requires Angular 16.1 or later.

## Quick Start

Use the option that matches the tool you already run.

### 1) CEM Generator Plugin

Add `angularWrappersGeneratorPlugin(...)` to your standard `cem-generator.config.*` file. When generation runs, wrapper files are written to `outdir`.
- **Tools:** [`@wc-toolkit/cem-generator`](https://www.npmjs.com/package/@wc-toolkit/cem-generator), [`angularWrappersGeneratorPlugin`](https://www.npmjs.com/package/@wc-toolkit/angular-wrappers)

```js
// cem-generator.config.mjs
import { angularWrappersGeneratorPlugin } from "@wc-toolkit/angular-wrappers";

export default {
  plugins: [angularWrappersGeneratorPlugin({ outdir: "./angular" })],
};
```

Then run `npx cem generate`.

### 2) CEM Analyzer Plugin

Add `angularWrappersAnalyzerPlugin(...)` to `custom-elements-manifest.config.*` under `plugins`. Then run `cem analyze` to generate wrappers into `outdir`.
- **Tools:** [CEM Analyzer](https://custom-elements-manifest.open-wc.org/analyzer/getting-started/), [`angularWrappersAnalyzerPlugin`](https://www.npmjs.com/package/@wc-toolkit/angular-wrappers)

```js
// custom-elements-manifest.config.mjs
import { angularWrappersAnalyzerPlugin } from "@wc-toolkit/angular-wrappers";

export default {
  plugins: [
    angularWrappersAnalyzerPlugin({
      outdir: "./angular",
    }),
  ],
};
```

Then run `npx cem analyze`.

### 3) Programmatic Usage

Import `generateAngularWrappers(...)`, pass a manifest object, and provide options directly in code. The function returns metadata about generated and removed files.

```ts
import manifest from "./custom-elements.json" with { type: "json" };
import { generateAngularWrappers } from "@wc-toolkit/angular-wrappers";

const result = generateAngularWrappers(manifest, {
  outdir: "./angular",
  stronglyTypedEvents: true,
});

console.log(result.generatedFiles);
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

| Option                   | Type                                             | Default         | Description                                                                     |
| ------------------------ | ------------------------------------------------ | --------------- | ------------------------------------------------------------------------------- |
| `outdir`                 | `string`                                         | `"./angular"`   | Output directory for generated files                                            |
| `packageJsonPath`        | `string`                                         | `process.cwd()/package.json` | Path used to resolve fallback module imports when CEM module paths are remapped |
| `modulePath`             | `(className, tagName, cemModulePath?) => string` | CEM module path | Transform or replace the import path of the element module                      |
| `defaultExport`          | `boolean`                                        | `false`         | Import the element class as a default export                                    |
| `stronglyTypedEvents`    | `boolean`                                        | `false`         | Generate `<Component><Event>ElementEvent` aliases whose `target` is the element |
| `attributeMapping`       | `Record<string, string>`                         | `{}`            | Rename attributes to input names. Required for reserved names such as `class`   |
| `globalProps`            | `MappedAttribute[]`                              | `[]`            | Inputs added to every wrapper                                                   |
| `globalEvents`           | `GlobalEvent[]`                                  | `[]`            | Outputs added to every wrapper                                                  |
| `componentNameFormatter` | `(tagName, componentName) => string`             | `undefined`     | Customize the generated class and file names                                    |
| `exclude`                | `string[]`                                       | `[]`            | Component class names to skip                                                   |
| `descriptionSrc`         | `"description" \| "summary"`                     | `"description"` | Manifest field used for component documentation                                 |
| `debug`                  | `boolean`                                        | `false`         | Enable detailed logging                                                         |
| `failOnWarnings`         | `boolean`                                        | `false`         | Treat generation warnings as errors (recommended in CI)                         |
| `skip`                   | `boolean`                                        | `false`         | Skip generation (useful for conditional execution)                              |

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

## Differences From React Wrappers

- No `reactProps`, `scopedTags`, or `ssrSafe` options yet. Angular equivalents are planned.
- Wrappers declare only the members from the manifest. Native HTML attributes such as `id` and `tabindex` work without declaration.

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
