#!/usr/bin/env node

import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { isMainModule } from './module-entrypoint.mjs';

async function listFragmentFiles(rootDir) {
  const results = [];
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFragmentFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('-desktop-manifest-fragment.json')) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

export async function mergeDesktopManifest(releaseRoot) {
  const releaseRootStat = await stat(releaseRoot).catch(() => null);
  if (!releaseRootStat?.isDirectory()) {
    throw new Error(`release 产物目录不存在：${releaseRoot}`);
  }

  const fragmentFiles = await listFragmentFiles(releaseRoot);
  if (fragmentFiles.length === 0) {
    return null;
  }

  const fragmentBaseName = path.basename(fragmentFiles[0]);
  const finalName = fragmentBaseName.replace(
    '-desktop-manifest-fragment.json',
    '-desktop-manifest.json',
  );

  let releaseTag = null;
  let version = null;
  const platforms = {};

  for (const fragmentFile of fragmentFiles) {
    if (path.basename(fragmentFile) !== fragmentBaseName) {
      throw new Error(`发现不一致的桌面 manifest 片段：${fragmentFile}`);
    }

    const fragment = JSON.parse(await readFile(fragmentFile, 'utf8'));
    if (!fragment.releaseTag || typeof fragment.releaseTag !== 'string') {
      throw new Error(`桌面 manifest 片段缺少 releaseTag：${fragmentFile}`);
    }
    if (!fragment.version || typeof fragment.version !== 'string') {
      throw new Error(`桌面 manifest 片段缺少 version：${fragmentFile}`);
    }
    if (!fragment.platforms || typeof fragment.platforms !== 'object') {
      throw new Error(`桌面 manifest 片段缺少 platforms：${fragmentFile}`);
    }

    if (releaseTag && releaseTag !== fragment.releaseTag) {
      throw new Error(`桌面 manifest releaseTag 不一致：${fragmentFile}`);
    }
    if (version && version !== fragment.version) {
      throw new Error(`桌面 manifest version 不一致：${fragmentFile}`);
    }
    releaseTag = fragment.releaseTag;
    version = fragment.version;

    for (const [platform, entry] of Object.entries(fragment.platforms)) {
      if (platforms[platform]) {
        throw new Error(`桌面 manifest 重复平台：${platform}`);
      }
      platforms[platform] = entry;
    }
  }

  if (!releaseTag || !version) {
    throw new Error('桌面 manifest 片段不完整。');
  }

  const finalPath = path.join(releaseRoot, finalName);
  await writeFile(
    finalPath,
    `${JSON.stringify(
      {
        version,
        platforms,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  for (const fragmentFile of fragmentFiles) {
    await rm(fragmentFile, { force: true });
  }

  return finalPath;
}

async function main() {
  const releaseRoot = process.argv[2];
  if (!releaseRoot) {
    throw new Error('缺少 release 产物目录参数。');
  }

  const mergedPath = await mergeDesktopManifest(releaseRoot);
  if (!mergedPath) {
    process.stdout.write('未发现桌面 manifest 片段，跳过合并。\n');
    return;
  }

  process.stdout.write(`已生成桌面 manifest：${mergedPath}\n`);
}

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
