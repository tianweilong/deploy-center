#!/usr/bin/env node

import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { isMainModule } from './module-entrypoint.mjs';

async function collectUpdaterFragments(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
  const fragments = [];
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      fragments.push(...(await collectUpdaterFragments(rootDir, fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('-tauri-updater-fragment.json')) {
      fragments.push(fullPath);
    }
  }
  return fragments.sort();
}

function buildAssetUrl(repository, releaseTag, file) {
  return `https://github.com/${repository}/releases/download/${releaseTag}/${file}`;
}

export async function mergeTauriUpdaterJson(releaseRoot, repository) {
  const fragmentPaths = await collectUpdaterFragments(releaseRoot);
  if (fragmentPaths.length === 0) {
    return [];
  }

  const groups = new Map();
  for (const fragmentPath of fragmentPaths) {
    const fragment = JSON.parse(await readFile(fragmentPath, 'utf8'));
    const key = `${fragment.packageKey}\0${fragment.releaseTag}`;
    const current = groups.get(key) ?? {
      packageKey: fragment.packageKey,
      releaseTag: fragment.releaseTag,
      version: fragment.version,
      platforms: {},
    };
    if (current.version !== fragment.version) {
      throw new Error(`Tauri updater 片段版本不一致：${fragmentPath}`);
    }
    for (const [platform, value] of Object.entries(fragment.platforms ?? {})) {
      current.platforms[platform] = {
        signature: value.signature,
        url: buildAssetUrl(repository, fragment.releaseTag, value.file),
      };
    }
    groups.set(key, current);
  }

  const outputPaths = [];
  for (const updater of groups.values()) {
    const outputPath = path.join(releaseRoot, `${updater.packageKey}-updater.json`);
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          version: updater.version,
          pub_date: new Date().toISOString(),
          platforms: Object.fromEntries(
            Object.entries(updater.platforms).sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          ),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    outputPaths.push(outputPath);
  }

  await Promise.all(fragmentPaths.map((fragmentPath) => rm(fragmentPath, { force: true })));
  return outputPaths;
}

async function main() {
  const [releaseRoot = 'release-artifacts', repository = 'tianweilong/deploy-center'] =
    process.argv.slice(2);
  await mergeTauriUpdaterJson(path.resolve(releaseRoot), repository);
}

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
