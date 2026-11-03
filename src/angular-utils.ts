import path from "path";
import fs from "fs";
import { toCamelCase } from "@wc-toolkit/cem-utilities";
import type { Component } from "@wc-toolkit/cem-utilities";

/** Converts kebab-case CEM names to camelCase, leaving names that are already camelCase untouched. */
export function toInputName(name: string) {
  return name.includes("-") ? toCamelCase(name) : name;
}

export function getModulePath(
  modulePath:
    | ((className: string, tagName: string, cemModulePath?: string) => string)
    | undefined,
  component: Component,
  outdir: string,
  packageJsonPath?: string,
) {
  if (modulePath instanceof Function) {
    return modulePath(component.name, component.tagName!, component.modulePath);
  }

  if (component.modulePath && looksLikeFilePath(component.modulePath)) {
    const relativePath = path
      .relative(path.resolve(outdir), path.resolve(component.modulePath))
      .replaceAll(path.sep, "/");
    return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
  }

  const packageJson = getPackageJson(packageJsonPath);

  if (!packageJson.module) {
    throw new Error(
      "You must define a module path in order to generate Angular wrappers.",
    );
  }

  const directories = outdir?.split("/");
  return path.join(directories.map(() => "../").join(""), packageJson.module);
}

export function getPackageJson(packageJsonPath?: string): { module?: string } {
  const resolvedPath = packageJsonPath
    ? path.resolve(packageJsonPath)
    : path.join(process.cwd(), "package.json");
  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

function looksLikeFilePath(value: string): boolean {
  return (
    path.isAbsolute(value) ||
    value.startsWith(".") ||
    value.includes("/") ||
    /\.[cm]?[jt]sx?$/.test(value)
  );
}

/**
 * Names that cannot be used as Angular inputs or outputs without colliding with
 * HTML attributes or JavaScript identifiers. Use `attributeMapping` to rename them.
 */
export const RESERVED_WORDS = ["class", "for", "style", "children"];
