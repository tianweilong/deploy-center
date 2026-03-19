#!/usr/bin/env node

import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

async function listChecksumFiles(rootDir) {
  const results = [];
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listChecksumFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('-checksums.txt')) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

async function main() {
  const releaseRoot = process.argv[2];
  if (!releaseRoot) {
    throw new Error('缺少 release 产物目录参数。');
  }

  const releaseRootStat = await stat(releaseRoot).catch(() => null);
  if (!releaseRootStat?.isDirectory()) {
    throw new Error(`release 产物目录不存在：${releaseRoot}`);
  }

  const checksumFiles = await listChecksumFiles(releaseRoot);
  if (checksumFiles.length === 0) {
    throw new Error(`在 ${releaseRoot} 中未找到校验文件。`);
  }

  const targetName = path.basename(checksumFiles[0]);
  const mergedFile = path.join(releaseRoot, targetName);
  const mergedLines = new Set();

  for (const checksumFile of checksumFiles) {
    if (path.basename(checksumFile) !== targetName) {
      throw new Error(`发现不一致的校验文件名：${checksumFile}`);
    }
    const content = await readFile(checksumFile, 'utf8');
    for (const line of content.split('\n')) {
      if (line.trim()) {
        mergedLines.add(line);
      }
    }
  }

  await writeFile(mergedFile, `${[...mergedLines].sort().join('\n')}\n`, 'utf8');

  for (const checksumFile of checksumFiles) {
    if (checksumFile !== mergedFile) {
      await rm(checksumFile, { force: true });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
