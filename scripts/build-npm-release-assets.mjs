#!/usr/bin/env node

import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  copyManifestFilesToStage,
  createPlatformArchive,
  initNpmReleaseContext,
  recreateDir,
  resolveDistPlatformDir,
  resolveSourcePath,
  runCommand,
  writeSha256Checksum,
} from './npm-release-common.mjs';
import { validateBuildContract } from './validate-npm-build-contract.mjs';

async function main() {
  const sourceDir = process.argv[2] ?? 'source';
  const targetOs = process.env.TARGET_OS;
  const targetArch = process.env.TARGET_ARCH;
  const archiveExt = process.env.ARCHIVE_EXT;
  const buildArtifactDirInput = process.env.BUILD_ARTIFACT_DIR ?? '';

  if (!targetOs) {
    throw new Error('缺少 TARGET_OS');
  }
  if (!targetArch) {
    throw new Error('缺少 TARGET_ARCH');
  }
  if (!archiveExt) {
    throw new Error('缺少 ARCHIVE_EXT');
  }

  const context = await initNpmReleaseContext(sourceDir);
  const artifactDir = buildArtifactDirInput
    ? resolveSourcePath(context.sourceRoot, buildArtifactDirInput)
    : path.join(process.cwd(), '.release-artifacts', `${targetOs}-${targetArch}`);

  await runCommand('pnpm', ['i', '--frozen-lockfile'], {
    cwd: context.sourceRoot,
  });
  await runCommand('pnpm', ['run', 'build:npx'], {
    cwd: context.sourceRoot,
    env: {
      ...process.env,
      TARGET_OS: targetOs,
      TARGET_ARCH: targetArch,
    },
  });

  const distPlatformDir = resolveDistPlatformDir(targetOs, targetArch);
  const sourceDistDir = path.join(
    context.sourceRoot,
    context.packageDir,
    'dist',
    distPlatformDir,
  );
  const contract = await validateBuildContract(sourceDistDir);

  const assetName = `${context.releaseTag}-${targetOs}-${targetArch}.${archiveExt}`;
  const archivePath = path.join(artifactDir, assetName);
  const stageDir = path.join(artifactDir, 'stage');
  const checksumFile = path.join(
    artifactDir,
    `${context.releasePackageKey}-${context.sourceTag}-checksums.txt`,
  );

  await recreateDir(artifactDir);
  await copyManifestFilesToStage(contract.platformDir, stageDir, contract.files);
  await createPlatformArchive(stageDir, archivePath, archiveExt);
  await writeSha256Checksum(archivePath, checksumFile);
  await rm(stageDir, { recursive: true, force: true });

  process.stdout.write(`仅构建 ${targetOs}-${targetArch} Release 资产目录：${artifactDir}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
