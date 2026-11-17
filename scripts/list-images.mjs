#!/usr/bin/env node

import { resolve } from "node:path";

import { discoverImageDefinitions, selectImageDefinitions } from "./image-definitions.mjs";

const projectDir = resolve(import.meta.dirname, "..");
for (const definition of await selectImageDefinitions(await discoverImageDefinitions(projectDir))) {
  console.log(`${definition.image}\t${definition.filename}`);
}
