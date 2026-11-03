import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generateAngularWrappers } from "../../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(readFileSync(path.join(root, "demo/custom-elements.json"), "utf8"));

generateAngularWrappers(manifest, {
  outdir: path.join(root, "demo/app/src/app/wrappers"),
  modulePath: () => "../../elements/my-button.js",
  stronglyTypedEvents: true,
  debug: true,
});
