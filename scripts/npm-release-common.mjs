#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  cp,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

import { buildReleaseMeta } from './release-meta.mjs';

export function resolveSourcePath(sourceRoot, relativePath) {
  return path.resolve(sourceRoot, relativePath);
}

export function resolveDistPlatformDir(targetOs, targetArch) {
  switch (`${targetOs}-${targetArch}`) {
    case 'linux-x64':
      return 'linux-x64';
    case 'linux-arm64':
      return 'linux-arm64';
    case 'win32-x64':
      return 'windows-x64';
    case 'darwin-arm64':
      return 'macos-arm64';
    default:
      throw new Error(`不支持的 dist 平台目录映射：${targetOs}-${targetArch}`);
  }
}

export function parseSourceTagVersion(sourceTag) {
  const match = /^v([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(sourceTag);
  if (!match) {
    throw new Error(`发布标签 ${sourceTag} 不符合 vX.Y.Z 格式。`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    version: sourceTag.slice(1),
  };
}

export function resolvePublishVersion({
  strategy,
  sourceTag,
  packageVersion,
  baseVersion,
  patchFactor,
}) {
  switch (strategy) {
    case 'package_json':
      return packageVersion;
    case 'source_tag':
      return parseSourceTagVersion(sourceTag).version;
    case 'base_patch_offset': {
      if (!baseVersion) {
        throw new Error('缺少 NPM_BASE_VERSION_FILE 对应版本。');
      }
      if (!patchFactor) {
        throw new Error('缺少 NPM_VERSION_PATCH_FACTOR。');
      }

      const tag = parseSourceTagVersion(sourceTag);
      const baseMatch = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(baseVersion);
      if (!baseMatch) {
        throw new Error(`基线版本 ${baseVersion} 不符合 X.Y.Z 格式。`);
      }

      if (!/^[1-9][0-9]*$/.test(String(patchFactor))) {
        throw new Error(
          `npm_version_patch_factor=${patchFactor} 不是有效正整数。`,
        );
      }

      const baseMajor = Number(baseMatch[1]);
      const baseMinor = Number(baseMatch[2]);
      const basePatch = Number(baseMatch[3]);
      const numericPatchFactor = Number(patchFactor);

      if (tag.major !== baseMajor || tag.minor !== baseMinor) {
        throw new Error(
          `发布标签 ${sourceTag} 的 major/minor 与基线版本 ${baseVersion} 不一致。`,
        );
      }

      const mappedBasePatch = Math.floor(tag.patch / numericPatchFactor);
      const releaseSeq = tag.patch % numericPatchFactor;

      if (mappedBasePatch !== basePatch) {
        throw new Error(
          `发布标签 ${sourceTag} 的 patch 无法映射到基线 patch ${basePatch}。`,
        );
      }

      if (releaseSeq < 1 || releaseSeq >= numericPatchFactor) {
        throw new Error(
          `发布标签 ${sourceTag} 的发布序号 ${releaseSeq} 超出 1..${numericPatchFactor - 1} 范围。`,
        );
      }

      return tag.version;
    }
    default:
      throw new Error(`不支持的 npm_version_strategy：${strategy}`);
  }
}

export function buildReleaseMetaPayload({
  packageName,
  publishVersion,
  sourceTag,
  distributionMode = 'github_release',
  releaseRepository = 'tianweilong/deploy-center',
}) {
  return {
    packageName,
    publishVersion,
    sourceTag,
    distributionMode,
    releaseRepository,
  };
}

export async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`命令执行失败：${command} ${args.join(' ')}（退出码 ${code ?? 'null'}）`),
      );
    });
  });
}

export async function initNpmReleaseContext(sourceDir = 'source', env = process.env) {
  const sourceTag = env.SOURCE_TAG;
  const packageName = env.NPM_PACKAGE_NAME;
  const packageDir = env.NPM_PACKAGE_DIR;
  const versionStrategy = env.NPM_VERSION_STRATEGY;

  if (!sourceTag) {
    throw new Error('缺少 SOURCE_TAG');
  }
  if (!packageName) {
    throw new Error('缺少 NPM_PACKAGE_NAME');
  }
  if (!packageDir) {
    throw new Error('缺少 NPM_PACKAGE_DIR');
  }
  if (!versionStrategy) {
    throw new Error('缺少 NPM_VERSION_STRATEGY');
  }

  const sourceRoot = await realpath(sourceDir);
  const packageJsonPath = path.join(sourceRoot, packageDir, 'package.json');
  const packageJson = await readJsonFile(packageJsonPath);
  const actualPackageName = packageJson.name;

  if (actualPackageName !== packageName) {
    throw new Error(
      `源仓库 npm 包名 ${actualPackageName} 与请求值 ${packageName} 不一致。`,
    );
  }

  let baseVersion;
  if (versionStrategy === 'base_patch_offset') {
    const baseVersionFile = env.NPM_BASE_VERSION_FILE;
    if (!baseVersionFile) {
      throw new Error('缺少 NPM_BASE_VERSION_FILE');
    }
    baseVersion = (await readJsonFile(path.join(sourceRoot, baseVersionFile))).version;
  }

  const publishVersion = resolvePublishVersion({
    strategy: versionStrategy,
    sourceTag,
    packageVersion: packageJson.version,
    baseVersion,
    patchFactor: env.NPM_VERSION_PATCH_FACTOR,
  });
  const releasePackageKey = packageName.split('/').at(-1);
  const releaseMetaPayload = buildReleaseMetaPayload({
    packageName: actualPackageName,
    publishVersion,
    sourceTag,
  });
  const releaseTag = buildReleaseMeta(releaseMetaPayload).releaseTag;

  return {
    sourceDir,
    sourceRoot,
    packageDir,
    packageJsonPath,
    actualPackageName,
    publishVersion,
    releasePackageKey,
    releaseMetaPayload,
    releaseTag,
    sourceTag,
  };
}

export async function recreateDir(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await mkdir(dirPath, { recursive: true });
}

export async function copyTree(sourceDir, destinationDir, filter) {
  await cp(sourceDir, destinationDir, {
    recursive: true,
    force: true,
    filter: (src) => {
      if (!filter) {
        return true;
      }
      return filter(src, sourceDir);
    },
  });
}

export async function copyPackageDirectory(sourceDir, destinationDir) {
  await recreateDir(destinationDir);
  await copyTree(sourceDir, destinationDir, (src, root) => {
    const relativePath = path.relative(root, src);
    if (!relativePath) {
      return true;
    }
    if (!relativePath.includes(path.sep) && relativePath.endsWith('.tgz')) {
      return false;
    }
    return true;
  });
}

export async function copyManifestFilesToStage(sourceDir, stageDir, manifestFiles) {
  await mkdir(stageDir, { recursive: true });
  await cp(path.join(sourceDir, 'manifest.json'), path.join(stageDir, 'manifest.json'));

  for (const relativePath of manifestFiles) {
    if (!relativePath) {
      continue;
    }
    const destinationPath = path.join(stageDir, relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await cp(path.join(sourceDir, relativePath), destinationPath);
  }
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const crc32Table = buildCrc32Table();

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

async function collectFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, fullPath)));
      continue;
    }
    if (entry.isFile()) {
      files.push({
        absolutePath: fullPath,
        relativePath: path.relative(rootDir, fullPath).split(path.sep).join('/'),
      });
    }
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function msDosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

async function writeZipArchive(sourceDir, archivePath) {
  const files = await collectFiles(sourceDir);
  if (files.length === 0) {
    throw new Error('待压缩目录为空。');
  }

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const content = await readFile(file.absolutePath);
    const fileNameBuffer = Buffer.from(file.relativePath, 'utf8');
    const fileStat = await stat(file.absolutePath);
    const { time, date } = msDosDateTime(fileStat.mtime);
    const checksum = crc32(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(fileNameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, fileNameBuffer, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(fileNameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, fileNameBuffer);

    offset += localHeader.length + fileNameBuffer.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(files.length, 8);
  endOfCentralDirectory.writeUInt16LE(files.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  await writeFile(
    archivePath,
    Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]),
  );
}

export async function validateZipArchiveContents(archivePath) {
  const buffer = await readFile(archivePath);
  const eocdSignature = 0x06054b50;
  const centralDirectorySignature = 0x02014b50;
  const searchStart = Math.max(0, buffer.length - 65557);

  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= searchStart; index -= 1) {
    if (buffer.readUInt32LE(index) === eocdSignature) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('zip 产物缺少可识别的中央目录。');
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let cursor = centralDirectoryOffset;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (buffer.readUInt32LE(cursor) !== centralDirectorySignature) {
      throw new Error('zip 产物中央目录条目损坏。');
    }
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraFieldLength = buffer.readUInt16LE(cursor + 30);
    const fileCommentLength = buffer.readUInt16LE(cursor + 32);
    const fileName = buffer
      .slice(cursor + 46, cursor + 46 + fileNameLength)
      .toString('utf8');
    entries.push(fileName);
    cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  const normalizedEntries = entries.map((entry) => entry.replace(/^\.\//, ''));
  if (!normalizedEntries.includes('manifest.json')) {
    throw new Error('zip 产物缺少 manifest.json。');
  }

  const fileEntries = normalizedEntries.filter(
    (entry) => entry && !entry.endsWith('/'),
  );
  if (fileEntries.length < 2) {
    throw new Error('zip 产物仅包含 manifest.json，缺少平台文件。');
  }
}

export async function createPlatformArchive(sourceDir, archivePath, archiveExt) {
  await rm(archivePath, { force: true });

  if (archiveExt === 'zip') {
    await writeZipArchive(sourceDir, archivePath);
    await validateZipArchiveContents(archivePath);
    return;
  }
  if (archiveExt === 'tar.gz') {
    await runCommand('tar', ['-czf', archivePath, '-C', sourceDir, '.']);
    return;
  }

  throw new Error(`不支持的 archive 扩展名：${archiveExt}`);
}

export async function writeSha256Checksum(filePath, outputPath) {
  const hash = crypto
    .createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
  await writeFile(outputPath, `${hash}  ${path.basename(filePath)}\n`, 'utf8');
}
