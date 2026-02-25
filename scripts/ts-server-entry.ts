#!/usr/bin/env bun
import { spawn } from "bun";

const appRoot = process.env.APP_ROOT || process.cwd();
const nextCli = `${appRoot}/node_modules/.bin/next`;

const child = spawn({
  // Use local Next.js CLI directly to avoid requiring external `bun`/`bunx`.
  cmd: [nextCli, "start"],
  cwd: appRoot,
  env: process.env,
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const exitCode = await child.exited;
process.exit(exitCode);
