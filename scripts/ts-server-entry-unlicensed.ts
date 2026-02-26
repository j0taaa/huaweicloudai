#!/usr/bin/env bun
export {};

if (!process.env.LICENSE_MODE) {
  process.env.LICENSE_MODE = "disabled";
}
if (!process.env.LICENSE_ENFORCEMENT) {
  process.env.LICENSE_ENFORCEMENT = "disabled";
}

await import("./ts-server-entry-core");
