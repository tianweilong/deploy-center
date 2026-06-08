#!/usr/bin/env node

import process from 'node:process';

import { isMainModule } from './module-entrypoint.mjs';

export function buildDockerBuildArgLines(buildArgsJson = '{}') {
  const buildArgs = JSON.parse(buildArgsJson || '{}');
  const lines = [];
  for (const [key, value] of Object.entries(buildArgs)) {
    lines.push('--build-arg');
    lines.push(`${key}=${value}`);
  }
  return lines;
}

function main() {
  process.stdout.write(`${buildDockerBuildArgLines(process.env.BUILD_ARGS_JSON).join('\n')}\n`);
}

if (isMainModule(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
