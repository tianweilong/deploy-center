#!/usr/bin/env node

import { access, appendFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { isMainModule } from './module-entrypoint.mjs';

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function detectGoModule(sourceDir = 'source') {
  const candidates = ['go.mod', path.join('go', 'go.mod')];
  for (const candidate of candidates) {
    const absolutePath = path.join(sourceDir, candidate);
    if (await exists(absolutePath)) {
      return path.posix.join(sourceDir.replaceAll(path.sep, '/'), candidate.replaceAll(path.sep, '/'));
    }
  }
  return '';
}

async function main() {
  const [sourceDir = 'source'] = process.argv.slice(2);
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    throw new Error('缺少环境变量：GITHUB_OUTPUT');
  }
  await appendFile(outputPath, `path=${await detectGoModule(sourceDir)}\n`, 'utf8');
}

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
