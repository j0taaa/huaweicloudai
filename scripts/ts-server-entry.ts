#!/usr/bin/env bun
import { createRequire } from "node:module";

const appRoot = process.env.APP_ROOT || process.cwd();
process.chdir(appRoot);

// Execute Next.js CLI in-process on the embedded Bun runtime from this
// compiled executable so no external `bun`, `bunx`, or `node` binary is
// required on target systems.
process.argv = [process.argv0 || "bun", "next", "start"];
const require = createRequire(import.meta.url);
require(`${appRoot}/node_modules/next/dist/bin/next`);
