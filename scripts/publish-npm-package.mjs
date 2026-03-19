#!/usr/bin/env node

import { readdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { readJsonFile, runCommand } from './npm-release-common.mjs';

async function readManifestEntries(manifestFile) {
  return (await readFile(manifestFile, 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function findPackageArchive(packageDir) {
  return (await readdir(packageDir)).find((entry) => entry.endsWith('.tgz'));
}

async function commandSucceeds(command, args, options = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      ...options,
    });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

async function main() {
  const inputDirArg = process.argv[2] ?? 'npm-publish-input';
  const inputDir = path.resolve(inputDirArg);
  const publishContextPath = path.join(inputDir, 'publish-context.json');
  const manifestFile = path.join(inputDir, 'manifest.txt');

  try {
    await readFile(publishContextPath);
  } catch {
    throw new Error(`缺少发布上下文文件：${publishContextPath}`);
  }
  try {
    await readFile(manifestFile);
  } catch {
    throw new Error(`缺少发布清单文件：${manifestFile}`);
  }

  const manifestEntries = await readManifestEntries(manifestFile);
  for (const entry of manifestEntries) {
    try {
      await readFile(path.join(inputDir, entry));
    } catch {
      throw new Error(`发布输入缺少文件：${entry}`);
    }
  }

  const publishContext = await readJsonFile(publishContextPath);
  const packageDir = path.join(inputDir, publishContext.packageDir);
  const packageJsonPath = path.join(packageDir, 'package.json');

  try {
    await readFile(packageJsonPath);
  } catch {
    throw new Error(`缺少 package.json：${packageJsonPath}`);
  }

  for (const entry of await readdir(packageDir)) {
    if (entry.endsWith('.tgz')) {
      await rm(path.join(packageDir, entry), { force: true });
    }
  }

  await runCommand(
    'npm',
    [
      'version',
      publishContext.publishVersion,
      '--no-git-tag-version',
      '--allow-same-version',
    ],
    { cwd: packageDir },
  );
  await runCommand('npm', ['pack'], { cwd: packageDir });

  const packageFile = await findPackageArchive(packageDir);
  if (!packageFile) {
    throw new Error('缺少待发布的 tgz 包。');
  }

  const alreadyPublished = await commandSucceeds(
    'npm',
    ['view', `${publishContext.packageName}@${publishContext.publishVersion}`, 'version'],
    { cwd: packageDir },
  );
  if (alreadyPublished) {
    process.stdout.write(
      `${publishContext.packageName}@${publishContext.publishVersion} 已存在，跳过发布。\n`,
    );
    return;
  }

  process.stdout.write(
    `通过 Trusted Publishing 发布 ${packageFile} -> ${publishContext.packageName}@${publishContext.publishVersion}\n`,
  );
  await runCommand('npm', ['publish', packageFile, '--access', 'public'], {
    cwd: packageDir,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
