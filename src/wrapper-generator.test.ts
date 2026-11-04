import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { generateAngularWrappers } from "./wrapper-generator";
import type { AngularWrapperOptions } from "./types";

const tempDirs: string[] = [];

function createTempDir() {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "wc-toolkit-angular-wrappers-"),
  );
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

function createManifest(
  declarations: Record<string, unknown>[] = [
    {
      kind: "class",
      name: "MyButton",
      tagName: "my-button",
      customElement: true,
      attributes: [
        {
          name: "variant",
          fieldName: "variant",
          type: { text: "'primary' | 'secondary'" },
          description: "The visual variant.",
        },
        {
          name: "disabled",
          fieldName: "disabled",
          type: { text: "boolean" },
          description: "Disables the button.",
        },
      ],
      members: [
        {
          kind: "field",
          name: "variant",
          attribute: "variant",
          type: { text: "'primary' | 'secondary'" },
          description: "The visual variant.",
        },
        {
          kind: "field",
          name: "disabled",
          attribute: "disabled",
          type: { text: "boolean" },
          description: "Disables the button.",
        },
        {
          kind: "field",
          name: "value",
          type: { text: "string" },
          description: "The current value.",
        },
        {
          kind: "field",
          name: "internalState",
          privacy: "private",
          type: { text: "string" },
          description: "Not public.",
        },
      ],
      events: [
        {
          name: "my-click",
          type: { text: "CustomEvent<MyDetail>" },
          description: "Fires when clicked.",
        },
        {
          name: "change",
          type: { text: "Event" },
          description: "Fires when the value changes.",
        },
      ],
    },
  ],
): unknown {
  return {
    schemaVersion: "1.0.0",
    modules: [
      {
        kind: "javascript-module",
        path: "src/my-button.ts",
        declarations,
        exports: [
          {
            kind: "js",
            name: "MyButton",
            declaration: { name: "MyButton", module: "src/my-button.ts" },
          },
          {
            kind: "custom-element-definition",
            name: "my-button",
            declaration: { name: "MyButton", module: "src/my-button.ts" },
          },
        ],
      },
    ],
  };
}

function squash(value: string) {
  return value.replace(/\s+/g, "");
}

function generate(
  options: Partial<AngularWrapperOptions> = {},
  manifest: unknown = createManifest(),
) {
  const outdir = createTempDir();
  generateAngularWrappers(manifest, {
    outdir,
    modulePath: () => "./my-components/autoloader",
    ...options,
  });
  return {
    outdir,
    component: () => fs.readFileSync(path.join(outdir, "MyButton.ts"), "utf8"),
    barrel: () => fs.readFileSync(path.join(outdir, "index.ts"), "utf8"),
  };
}

describe("generateAngularWrappers", () => {
  it("creates a standalone component per custom element with a barrel file", () => {
    const { outdir, component, barrel } = generate();

    expect(fs.existsSync(path.join(outdir, "MyButton.ts"))).toBe(true);
    expect(barrel()).toContain('export * from "./MyButton.js";');
    expect(squash(component())).toContain(squash('selector: "my-button"'));
    expect(squash(component())).toContain(squash("standalone: true"));
    expect(squash(component())).toContain(
      squash('template: "<ng-content></ng-content>"'),
    );
    expect(squash(component())).toContain(squash("export class MyButton"));
  });

  it("imports the element module for definition and typing", () => {
    const { component } = generate();

    expect(squash(component())).toContain(
      squash('import "./my-components/autoloader";'),
    );
    expect(squash(component())).toContain(
      squash(
        'import { MyButton as MyButtonElement } from "./my-components/autoloader";',
      ),
    );
    expect(squash(component())).toContain(
      squash("export type { MyButtonElement"),
    );
  });

  it("generates browser-only module loading when ssrSafe is enabled", () => {
    const { component } = generate({ ssrSafe: true });

    expect(squash(component())).toContain(
      squash('import { isPlatformBrowser } from "@angular/common";'),
    );
    expect(squash(component())).toContain(
      squash("private readonly platformId = inject(PLATFORM_ID);"),
    );
    expect(squash(component())).toContain(
      squash(
        "private readonly isBrowser = isPlatformBrowser(this.platformId);",
      ),
    );
    expect(squash(component())).toContain(
      squash(
        'if (this.isBrowser) { void import("./my-components/autoloader"); }',
      ),
    );
    expect(squash(component())).toContain(
      squash("if (!this.isBrowser) { return; }"),
    );
    expect(squash(component())).not.toContain(
      squash('import "./my-components/autoloader";'),
    );
  });

  it("falls back to named export when defaultExport is enabled but unavailable", () => {
    const { component } = generate({ defaultExport: true });

    expect(squash(component())).toContain(
      squash("MyButton as MyButtonElement"),
    );
  });

  it("uses the default export when defaultExport is enabled and available", () => {
    const outdir = createTempDir();
    generateAngularWrappers(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            kind: "javascript-module",
            path: "src/my-button.ts",
            declarations: [
              {
                kind: "class",
                name: "MyButton",
                tagName: "my-button",
                customElement: true,
              },
            ],
            exports: [
              {
                kind: "js",
                name: "default",
                declaration: { name: "MyButton", module: "src/my-button.ts" },
              },
              {
                kind: "custom-element-definition",
                name: "my-button",
                declaration: { name: "MyButton", module: "src/my-button.ts" },
              },
            ],
          },
        ],
      },
      {
        outdir,
        defaultExport: true,
        modulePath: () => "./my-components/autoloader",
      },
    );

    const contents = fs.readFileSync(path.join(outdir, "MyButton.ts"), "utf8");
    expect(squash(contents)).toContain(squash("default as MyButtonElement"));
  });

  it("falls back to HTMLUnknownElement typing when the class is not importable", () => {
    const outdir = createTempDir();
    generateAngularWrappers(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            kind: "javascript-module",
            path: "src/token-styles.ts",
            declarations: [
              {
                kind: "class",
                name: "TokenStyles",
                tagName: "token-styles",
                customElement: true,
                superclass: { name: "HTMLElement" },
              },
            ],
            exports: [
              {
                kind: "custom-element-definition",
                name: "token-styles",
                declaration: {
                  name: "TokenStyles",
                  module: "src/token-styles.ts",
                },
              },
            ],
          },
        ],
      },
      {
        outdir,
        modulePath: () => "./my-components/autoloader",
      },
    );

    const contents = fs.readFileSync(
      path.join(outdir, "TokenStyles.ts"),
      "utf8",
    );
    expect(squash(contents)).toContain(
      squash("export type TokenStylesElement = HTMLUnknownElement;"),
    );
    expect(squash(contents)).not.toContain(
      squash("TokenStyles as TokenStylesElement"),
    );
  });

  it("returns generation metadata", () => {
    const outdir = createTempDir();
    const result = generateAngularWrappers(createManifest(), {
      outdir,
      modulePath: () => "./my-components/autoloader",
    });

    expect(result.skipped).toBe(false);
    expect(result.outdir).toBe(outdir);
    expect(result.componentCount).toBe(1);
    expect(result.warningCount).toBe(0);
    expect(result.removedFiles).toEqual([]);
    expect(result.generatedFiles).toEqual(["MyButton.ts", "index.ts"]);
  });

  it("generates typed inputs with documentation from the manifest", () => {
    const { component } = generate();

    expect(squash(component())).toContain(squash("/** The visual variant. */"));
    expect(squash(component())).toContain(squash("@Input()"));
    expect(squash(component())).toContain(
      squash('get variant(): MyButtonElement["variant"] {'),
    );
    expect(squash(component())).toContain(
      squash("this.elementRef.nativeElement.variant = value;"),
    );
    expect(squash(component())).toContain(
      squash('get value(): MyButtonElement["value"]'),
    );
  });

  it("coerces boolean attributes with booleanAttribute", () => {
    const { component } = generate();

    expect(squash(component())).toContain(squash("booleanAttribute"));
    expect(squash(component())).toContain(
      squash("@Input({ transform: booleanAttribute })"),
    );
    expect(squash(component())).toContain(squash("get disabled(): boolean {"));
    expect(squash(component())).toContain(
      squash("set disabled(value: boolean) {"),
    );
  });

  it("skips private members and members that duplicate attributes", () => {
    const { component } = generate();

    expect(squash(component())).not.toContain(squash("internalState"));
    expect(component().match(/get variant\(\)/g)).toHaveLength(1);
  });

  it("generates outputs with typed custom event details and listener cleanup", () => {
    const { component } = generate({ stronglyTypedEvents: false });

    expect(squash(component())).toContain(
      squash(
        "@Output() readonly myClick = new EventEmitter<CustomEvent<MyDetail>>();",
      ),
    );
    expect(squash(component())).toContain(
      squash("@Output() readonly change = new EventEmitter<Event>();"),
    );
    expect(squash(component())).toContain(
      squash(
        '"my-click", (event) => this.myClick.emit(event as CustomEvent<MyDetail>)',
      ),
    );
    expect(squash(component())).toContain(
      squash("private readonly destroyRef = inject(DestroyRef);"),
    );
    expect(squash(component())).toContain(
      squash('"change", (event) => this.change.emit(event as Event)'),
    );
    expect(squash(component())).toContain(squash("this.destroyRef.onDestroy"));
  });

  it("imports detail types from the element module", () => {
    const { component } = generate();

    expect(squash(component())).toContain(
      squash('import type { MyDetail } from "./my-components/autoloader";'),
    );
  });

  it("generates strongly typed event aliases when stronglyTypedEvents is enabled", () => {
    const { component } = generate({ stronglyTypedEvents: true });

    expect(squash(component())).toContain(
      squash(
        "export type MyButtonElementEvent<E extends Event = CustomEvent> = E & {",
      ),
    );
    expect(squash(component())).toContain(
      squash(
        "export type MyButtonMyClickElementEvent = MyButtonElementEvent<CustomEvent<MyDetail>>;",
      ),
    );
    expect(squash(component())).toContain(
      squash(
        "export type MyButtonChangeElementEvent = MyButtonElementEvent<Event>;",
      ),
    );
    expect(squash(component())).toContain(
      squash(
        "@Output() readonly myClick = new EventEmitter<MyButtonMyClickElementEvent>();",
      ),
    );
  });

  it("generates event aliases by default", () => {
    const { component } = generate();

    expect(squash(component())).toContain(squash("MyButtonElementEvent"));
  });

  it("does not generate event aliases when stronglyTypedEvents is disabled", () => {
    const { component } = generate({ stronglyTypedEvents: false });

    expect(squash(component())).not.toContain(squash("ElementEvent"));
  });

  it("omits the event listener block when the element has no events", () => {
    const { component } = generate(
      {},
      createManifest([
        {
          kind: "class",
          name: "MyButton",
          tagName: "my-button",
          customElement: true,
          attributes: [
            { name: "variant", fieldName: "variant", type: { text: "string" } },
          ],
        },
      ]),
    );

    expect(squash(component())).not.toContain(squash("constructor()"));
    expect(squash(component())).not.toContain(squash("DestroyRef"));
  });

  it("still emits a constructor for browser module loading when ssrSafe has no events", () => {
    const { component } = generate(
      { ssrSafe: true },
      createManifest([
        {
          kind: "class",
          name: "MyButton",
          tagName: "my-button",
          customElement: true,
          attributes: [
            { name: "variant", fieldName: "variant", type: { text: "string" } },
          ],
        },
      ]),
    );

    expect(squash(component())).toContain(squash("constructor()"));
    expect(squash(component())).toContain(
      squash(
        'if (this.isBrowser) { void import("./my-components/autoloader"); }',
      ),
    );
    expect(squash(component())).not.toContain(squash("DestroyRef"));
  });

  it("maps reserved attribute names with attributeMapping", () => {
    const manifest = createManifest([
      {
        kind: "class",
        name: "MyButton",
        tagName: "my-button",
        customElement: true,
        attributes: [
          { name: "class", fieldName: "className", type: { text: "string" } },
        ],
      },
    ]);

    expect(() => generate({}, manifest)).toThrow(/reserved keyword/);

    const { component } = generate(
      { attributeMapping: { class: "cssClass" } },
      manifest,
    );
    expect(squash(component())).toContain(squash("get cssClass(): string"));
    expect(squash(component())).toContain(
      squash(
        'this.elementRef.nativeElement.setAttribute("class", String(value));',
      ),
    );
  });

  it("uses setAttribute/removeAttribute for attribute-only inputs", () => {
    const { component } = generate(
      {},
      createManifest([
        {
          kind: "class",
          name: "MyButton",
          tagName: "my-button",
          customElement: true,
          attributes: [
            {
              name: "aria-label",
              type: { text: "string" },
              description: "Accessible label",
            },
          ],
          members: [],
        },
      ]),
    );

    expect(squash(component())).toContain(
      squash('@Input({ alias: "aria-label" })'),
    );
    expect(squash(component())).toContain(
      squash(
        'get ariaLabel(): string { return this.elementRef.nativeElement.getAttribute("aria-label"',
      ),
    );
    expect(squash(component())).toContain(
      squash(
        'this.elementRef.nativeElement.setAttribute("aria-label", String(value));',
      ),
    );
    expect(squash(component())).toContain(
      squash('this.elementRef.nativeElement.removeAttribute("aria-label");'),
    );
  });

  it("includes global props and events on every wrapper", () => {
    const { component } = generate({
      globalProps: [
        {
          name: "theme",
          description: "The theme applied to the component.",
          type: { text: "'light' | 'dark'" },
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

    expect(squash(component())).toContain(
      squash('get theme(): "light" | "dark"'),
    );
    expect(squash(component())).toContain(
      squash(
        "@Output() readonly themeChange = new EventEmitter<CustomEvent<string>>();",
      ),
    );
  });

  it("throws when global props collide with component-derived input names", () => {
    expect(() =>
      generate({
        globalProps: [
          {
            name: "value",
            description: "Collision",
            type: { text: "string" },
          },
        ],
      }),
    ).toThrow(/Duplicate input/);
  });

  it("throws when global events collide with component-derived outputs", () => {
    expect(() =>
      generate({
        globalEvents: [
          {
            event: "myClick",
            description: "Collision",
            type: "CustomEvent",
          },
        ],
      }),
    ).toThrow(/Duplicate output/);
  });

  it("excludes components listed in exclude", () => {
    const { outdir } = generate({ exclude: ["MyButton"] });

    expect(fs.existsSync(path.join(outdir, "MyButton.ts"))).toBe(false);
  });

  it("applies componentNameFormatter to class and file names", () => {
    const { outdir } = generate({
      componentNameFormatter: (_tag, name) => `Wc${name}`,
    });

    const contents = fs.readFileSync(
      path.join(outdir, "WcMyButton.ts"),
      "utf8",
    );
    expect(fs.existsSync(path.join(outdir, "MyButton.ts"))).toBe(false);
    expect(squash(contents)).toContain(squash("export class WcMyButton"));
  });

  it("generates nothing when skip is enabled", () => {
    const outdir = createTempDir();
    const result = generateAngularWrappers(createManifest(), {
      outdir,
      skip: true,
      modulePath: () => "./x",
    });

    expect(fs.readdirSync(outdir)).toHaveLength(0);
    expect(result).toEqual({
      outdir,
      generatedFiles: [],
      removedFiles: [],
      componentCount: 0,
      warningCount: 0,
      skipped: true,
    });
  });

  it("uses the CEM module path when no modulePath function is provided", () => {
    const outdir = createTempDir();
    generateAngularWrappers(createManifest(), { outdir });

    const contents = fs.readFileSync(path.join(outdir, "MyButton.ts"), "utf8");
    const expectedPath = path
      .relative(path.resolve(outdir), path.resolve("src/my-button.ts"))
      .replaceAll(path.sep, "/");
    expect(contents).toContain(`import "${expectedPath}";`);
  });

  it("cleans stale generated wrapper files from previous runs", () => {
    const outdir = createTempDir();
    const manifest = createManifest();

    generateAngularWrappers(manifest, {
      outdir,
      modulePath: () => "./my-components/autoloader",
    });
    expect(fs.existsSync(path.join(outdir, "MyButton.ts"))).toBe(true);

    const result = generateAngularWrappers(
      createManifest([
        {
          kind: "class",
          name: "MyInput",
          tagName: "my-input",
          customElement: true,
        },
      ]),
      {
        outdir,
        modulePath: () => "./my-components/autoloader",
      },
    );

    expect(fs.existsSync(path.join(outdir, "MyButton.ts"))).toBe(false);
    expect(fs.existsSync(path.join(outdir, "MyInput.ts"))).toBe(true);
    expect(result.removedFiles).toEqual(["MyButton.ts"]);
  });

  it("throws on warnings when failOnWarnings is enabled", () => {
    const outdir = createTempDir();

    expect(() =>
      generateAngularWrappers(
        {
          schemaVersion: "1.0.0",
          modules: [
            {
              kind: "javascript-module",
              path: "src/token-styles.ts",
              declarations: [
                {
                  kind: "class",
                  name: "TokenStyles",
                  tagName: "token-styles",
                  customElement: true,
                  superclass: { name: "HTMLElement" },
                },
              ],
              exports: [
                {
                  kind: "custom-element-definition",
                  name: "token-styles",
                  declaration: {
                    name: "TokenStyles",
                    module: "src/token-styles.ts",
                  },
                },
              ],
            },
          ],
        },
        {
          outdir,
          modulePath: () => "./my-components/autoloader",
          failOnWarnings: true,
        },
      ),
    ).toThrow(/Warning treated as error/);
  });
});
