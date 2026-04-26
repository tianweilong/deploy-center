#!/usr/bin/env node

import { readdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { isMainModule } from './module-entrypoint.mjs';
import {
  readJsonFile,
  resolveCommandForSpawn,
  shouldUseShellForCommand,
  runCommand,
} from './npm-release-common.mjs';

async function readManifestEntries(manifestFile) {
  return (await readFile(manifestFile, 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function findPackageArchive(packageDir) {
  return (await readdir(packageDir)).find((entry) => entry.endsWith('.tgz'));
}

async function fileExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function commandSucceeds(command, args, options = {}) {
  return await new Promise((resolve) => {
    const spawnOptions = {
      stdio: 'ignore',
      ...options,
    };
    if (spawnOptions.shell === undefined) {
      spawnOptions.shell = shouldUseShellForCommand(command);
    }

    const child = spawn(resolveCommandForSpawn(command), args, spawnOptions);
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
  const preparePublishScriptPath = path.join(
    packageDir,
    'scripts',
    'prepare-publish.mjs',
  );

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
  if (await fileExists(preparePublishScriptPath)) {
    await runCommand('node', [preparePublishScriptPath], { cwd: packageDir });
  }
  await runCommand('npm', ['pack', '--ignore-scripts'], { cwd: packageDir });

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
  const publishArgs = ['publish', packageFile, '--access', 'public'];
  if (publishContext.publishTag) {
    publishArgs.push('--tag', publishContext.publishTag);
  }
  await runCommand('npm', publishArgs, {
    cwd: packageDir,
  });
}

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
