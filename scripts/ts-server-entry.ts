#!/usr/bin/env bun
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";

const appRoot = process.env.APP_ROOT || process.cwd();
process.chdir(appRoot);

const packageJsonCache = new Map<string, Record<string, unknown> | null>();

function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !path.isAbsolute(specifier) && !specifier.startsWith("node:");
}

function splitPackageSpecifier(specifier: string): { packageName: string; subpath: string } {
  if (specifier.startsWith("@")) {
    const [scope, name, ...rest] = specifier.split("/");
    return { packageName: `${scope}/${name ?? ""}`, subpath: rest.join("/") };
  }
  const [name, ...rest] = specifier.split("/");
  return { packageName: name ?? "", subpath: rest.join("/") };
}

function stripTurbopackExternalHash(packageName: string): string {
  if (packageName.startsWith("@")) {
    const [scope, rawName, ...rest] = packageName.split("/");
    if (!rawName || rest.length) return packageName;
    return `${scope}/${rawName.replace(/-[0-9a-f]{16}$/i, "")}`;
  }
  return packageName.replace(/-[0-9a-f]{16}$/i, "");
}

function readPackageJson(packageDir: string): Record<string, unknown> | null {
  const cached = packageJsonCache.get(packageDir);
  if (cached !== undefined) return cached;

  const packageJsonPath = path.join(packageDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    packageJsonCache.set(packageDir, null);
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
    packageJsonCache.set(packageDir, parsed);
    return parsed;
  } catch {
    packageJsonCache.set(packageDir, null);
    return null;
  }
}

function selectConditionalExportTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;

  const obj = value as Record<string, unknown>;
  for (const key of ["require", "default", "import", "node", "bun"]) {
    const selected = selectConditionalExportTarget(obj[key]);
    if (selected) return selected;
  }

  for (const nested of Object.values(obj)) {
    const selected = selectConditionalExportTarget(nested);
    if (selected) return selected;
  }

  return undefined;
}

function resolveFileOrDirectory(basePath: string): string | undefined {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath;

  for (const ext of [".js", ".cjs", ".mjs", ".json"]) {
    const candidate = `${basePath}${ext}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }

  if (!fs.existsSync(basePath) || !fs.statSync(basePath).isDirectory()) return undefined;

  const pkg = readPackageJson(basePath);
  if (pkg?.exports) {
    const target = selectConditionalExportTarget((pkg.exports as Record<string, unknown>)["."] ?? pkg.exports);
    if (target && target.startsWith(".")) {
      const resolved = resolveFileOrDirectory(path.resolve(basePath, target));
      if (resolved) return resolved;
    }
  }

  if (typeof pkg?.main === "string") {
    const resolved = resolveFileOrDirectory(path.resolve(basePath, pkg.main));
    if (resolved) return resolved;
  }

  for (const indexFile of ["index.js", "index.cjs", "index.mjs", "index.json"]) {
    const candidate = path.join(basePath, indexFile);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }

  return undefined;
}

function resolveFromAppNodeModules(specifier: string): string | undefined {
  const { packageName, subpath } = splitPackageSpecifier(specifier);
  if (!packageName) return undefined;

  const packageNamesToTry = [packageName];
  const unhashedPackageName = stripTurbopackExternalHash(packageName);
  if (unhashedPackageName !== packageName) packageNamesToTry.push(unhashedPackageName);

  for (const candidatePackageName of packageNamesToTry) {
    const packageDir = path.join(appRoot, "node_modules", candidatePackageName);
    if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) continue;

    const pkg = readPackageJson(packageDir);
    const subpathKey = subpath ? `./${subpath}` : ".";
    const targetFromExports =
      pkg?.exports && typeof pkg.exports === "object"
        ? selectConditionalExportTarget((pkg.exports as Record<string, unknown>)[subpathKey])
        : !subpath
          ? selectConditionalExportTarget(pkg?.exports)
          : undefined;

    if (targetFromExports && targetFromExports.startsWith(".")) {
      const resolved = resolveFileOrDirectory(path.resolve(packageDir, targetFromExports));
      if (resolved) return resolved;
    }

    if (subpath) {
      const resolved = resolveFileOrDirectory(path.join(packageDir, subpath));
      if (resolved) return resolved;
    } else {
      const resolved = resolveFileOrDirectory(packageDir);
      if (resolved) return resolved;
    }
  }

  return undefined;
}

function installBareSpecifierFallbackResolver(): void {
  const modAny = Module as unknown as {
    _resolveFilename?: (request: string, parent: unknown, isMain: boolean, options: unknown) => string;
  };
  if (typeof modAny._resolveFilename !== "function") return;

  const originalResolveFilename = modAny._resolveFilename;
  modAny._resolveFilename = (request, parent, isMain, options) => {
    try {
      return originalResolveFilename(request, parent, isMain, options);
    } catch (error) {
      if (!isBareSpecifier(request)) throw error;
      const resolved = resolveFromAppNodeModules(request);
      if (resolved) return resolved;
      throw error;
    }
  };
}

installBareSpecifierFallbackResolver();
(globalThis as { __HCAI_RESOLVE_EXTERNAL_ID__?: (id: string) => string }).__HCAI_RESOLVE_EXTERNAL_ID__ = (id) => {
  return resolveFromAppNodeModules(id) ?? id;
};

// Execute Next.js CLI in-process on the embedded Bun runtime from this
// compiled executable so no external `bun`, `bunx`, or `node` binary is
// required on target systems.
process.argv = [process.argv0 || "bun", "next", "start"];
const requireFromApp = createRequire(path.join(appRoot, "package.json"));
requireFromApp(`${appRoot}/node_modules/next/dist/bin/next`);
