#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function inferTarget(platform) {
  switch (platform) {
    case 'linux-x64':
      return { targetOs: 'linux', targetArch: 'x64' };
    case 'linux-arm64':
      return { targetOs: 'linux', targetArch: 'arm64' };
    case 'windows-x64':
      return { targetOs: 'win32', targetArch: 'x64' };
    case 'macos-arm64':
      return { targetOs: 'darwin', targetArch: 'arm64' };
    default:
      throw new Error(`不支持的平台目录：${platform}`);
  }
}

async function readManifest(platformDir) {
  const manifestPath = path.join(platformDir, 'manifest.json');
  const content = await readFile(manifestPath, 'utf8');
  return JSON.parse(content);
}

async function ensureFileExists(filePath, relativePath) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`声明文件不存在：${relativePath}`);
  }
}

export async function validateBuildContract(platformDir) {
  const absolutePlatformDir = path.resolve(platformDir);
  const directoryPlatform = path.basename(absolutePlatformDir);
  const manifest = await readManifest(absolutePlatformDir);

  if (manifest.schemaVersion !== 1) {
    throw new Error(`schemaVersion 非法：${manifest.schemaVersion}`);
  }

  if (manifest.platform !== directoryPlatform) {
    throw new Error(
      `platform 字段与目录名不一致：${manifest.platform} !== ${directoryPlatform}`,
    );
  }

  const expectedTarget = inferTarget(directoryPlatform);
  if (manifest.targetOs !== expectedTarget.targetOs) {
    throw new Error(
      `targetOs 字段非法：${manifest.targetOs} !== ${expectedTarget.targetOs}`,
    );
  }
  if (manifest.targetArch !== expectedTarget.targetArch) {
    throw new Error(
      `targetArch 字段非法：${manifest.targetArch} !== ${expectedTarget.targetArch}`,
    );
  }

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('files 必须是非空数组');
  }

  const files = [];
  for (const relativePath of manifest.files) {
    if (typeof relativePath !== 'string' || relativePath.length === 0) {
      throw new Error('files 只能包含非空字符串');
    }
    const absoluteFilePath = path.join(absolutePlatformDir, relativePath);
    await ensureFileExists(absoluteFilePath, relativePath);
    files.push(relativePath);
  }

  return {
    platformDir: absolutePlatformDir,
    manifest,
    files,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const printFilesOnly = args[0] === '--print-files';
  const platformDir = printFilesOnly ? args[1] : args[0];
  if (!platformDir) {
    throw new Error(
      '用法：node scripts/validate-npm-build-contract.mjs [--print-files] <platform-dir>',
    );
  }

  const result = await validateBuildContract(platformDir);
  if (printFilesOnly) {
    process.stdout.write(`${result.files.join('\n')}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
