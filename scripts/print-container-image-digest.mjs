#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { isMainModule } from './module-entrypoint.mjs';

export async function readContainerImageDigest(metadataPath) {
  if (!metadataPath) {
    throw new Error('用法：node scripts/print-container-image-digest.mjs <metadata.json>');
  }
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  return metadata['containerimage.digest'] || '';
}

async function main() {
  const [metadataPath] = process.argv.slice(2);
  process.stdout.write(await readContainerImageDigest(metadataPath));
}

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
