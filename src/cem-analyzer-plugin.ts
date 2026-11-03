import { generateAngularWrappers } from "./wrapper-generator.js";
import type { AngularWrapperOptions } from "./types.js";
import type { Plugin } from "@wc-toolkit/cem-generator";
import type { Package } from "custom-elements-manifest";

export function angularWrappersAnalyzerPlugin(
  options: AngularWrapperOptions = {},
) {
  return {
    name: "angular-wrappers",
    packageLinkPhase({
      customElementsManifest,
    }: {
      customElementsManifest: unknown;
    }) {
      generateAngularWrappers(customElementsManifest, options);
    },
  };
}

/** Plugin for @wc-toolkit/cem-generator that generates Angular wrappers from the finalized CEM. */
export function angularWrappersGeneratorPlugin(
  options: AngularWrapperOptions = {},
): Plugin {
  return {
    name: "@wc-toolkit/angular-wrappers:cem-generator",
    afterGenerate(manifest: Package) {
      generateAngularWrappers(manifest, options);
    },
  };
}
