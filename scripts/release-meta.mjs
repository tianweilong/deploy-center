#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SUPPORTED_DISTRIBUTION_MODES = new Set([
  'github_release',
  'bundled_dist',
]);

function deriveReleasePackageKey(packageName) {
  if (typeof packageName !== 'string' || packageName.length === 0) {
    throw new Error('packageName 不能为空');
  }

  const segments = packageName.split('/');
  return segments[segments.length - 1];
}

export function buildReleaseMeta({
  packageName,
  publishVersion,
  sourceTag,
  distributionMode,
  releaseRepository,
}) {
  if (!SUPPORTED_DISTRIBUTION_MODES.has(distributionMode)) {
    throw new Error(`不支持的 distributionMode：${distributionMode}`);
  }

  const releasePackageKey = deriveReleasePackageKey(packageName);

  return {
    schemaVersion: 1,
    packageName,
    packageVersion: publishVersion,
    releaseRepository,
    releaseTag: `${releasePackageKey}-${sourceTag}`,
    releasePackageKey,
    distributionMode,
  };
}

async function writeReleaseMeta(filePath, meta) {
  const absolutePath = path.resolve(filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

async function main() {
  const [command, filePath, payloadJson] = process.argv.slice(2);

  if (command !== 'write' || !filePath || !payloadJson) {
    throw new Error(
      '用法：node scripts/release-meta.mjs write <file-path> <payload-json>',
    );
  }

  const payload = JSON.parse(payloadJson);
  const meta = buildReleaseMeta(payload);
  await writeReleaseMeta(filePath, meta);
  process.stdout.write(`${JSON.stringify(meta)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
