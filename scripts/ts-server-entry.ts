#!/usr/bin/env bun
import { spawn } from "bun";

const appRoot = process.env.APP_ROOT || process.cwd();

const child = spawn({
  cmd: ["bunx", "--bun", "next", "start"],
  cwd: appRoot,
  env: process.env,
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const exitCode = await child.exited;
process.exit(exitCode);
