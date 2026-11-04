#!/usr/bin/env bun
import { access, writeFile } from "fs/promises";
import { runCli } from "@core/cli";
import { createConfigStore } from "@core/config";
import type { CliDeps } from "@core/context";

const deps: CliDeps = {
  fetch: globalThis.fetch,
  env: process.env,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
  prompt: (question) => globalThis.prompt(question),
  configStore: createConfigStore(process.env),
  files: {
    exists: (path) => access(path).then(
      () => true,
      () => false,
    ),
    write: (path, content) => writeFile(path, content),
  },
};

process.exitCode = await runCli(process.argv.slice(2), deps);
