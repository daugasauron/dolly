#!/usr/bin/env node

import { resolve } from "node:path";

import {
  discoverImageDefinitions,
  inspectStaticSources,
  selectImageDefinitions,
} from "./image-definitions.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const definitions = selectImageDefinitions(await discoverImageDefinitions(projectDir));
const sources = await inspectStaticSources(projectDir, definitions);
const total = sources.reduce((sum, source) => sum + source.byteLength, 0);
console.log(`dolly: verified ${sources.length} HOST sources (${total} bytes)`);
