#!/usr/bin/env node

import { copyFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  buildDesktopManifestFragment,
  buildDesktopReleaseAssetName,
  copyManifestFilesToStage,
  createPlatformArchive,
  findDesktopBundleArtifact,
  buildSha256ChecksumLine,
  initNpmReleaseContext,
  recreateDir,
  resolveDistPlatformDir,
  resolveTauriPlatform,
  resolveSourcePath,
  runCommand,
  writeJsonFile,
  writeSha256Checksums,
} from './npm-release-common.mjs';
import { isMainModule } from './module-entrypoint.mjs';
import { validateBuildContract } from './validate-npm-build-contract.mjs';

async function main() {
  const sourceDir = process.argv[2] ?? 'source';
  const targetOs = process.env.TARGET_OS;
  const targetArch = process.env.TARGET_ARCH;
  const archiveExt = process.env.ARCHIVE_EXT;
  const buildArtifactDirInput = process.env.BUILD_ARTIFACT_DIR ?? '';
  const buildDesktopBundle = process.env.BUILD_DESKTOP_BUNDLE === 'true';
  const desktopReleaseMode = process.env.DESKTOP_RELEASE_MODE ?? 'auto';

  if (!targetOs) {
    throw new Error('缺少 TARGET_OS');
  }
  if (!targetArch) {
    throw new Error('缺少 TARGET_ARCH');
  }
  if (!archiveExt) {
    throw new Error('缺少 ARCHIVE_EXT');
  }
  if (!['auto', 'required', 'disabled'].includes(desktopReleaseMode)) {
    throw new Error(`不支持的 DESKTOP_RELEASE_MODE：${desktopReleaseMode}`);
  }

  const context = await initNpmReleaseContext(sourceDir);
  const artifactDir = buildArtifactDirInput
    ? resolveSourcePath(context.sourceRoot, buildArtifactDirInput)
    : path.join(process.cwd(), '.release-artifacts', `${targetOs}-${targetArch}`);

  await runCommand('pnpm', ['i', '--frozen-lockfile'], {
    cwd: context.sourceRoot,
  });
  const buildArgs = ['run', 'build:npx'];
  if (buildDesktopBundle) {
    buildArgs.push('--', '--desktop');
  }
  await runCommand('pnpm', buildArgs, {
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

  const checksumTargets = [archivePath];
  const tauriPlatform = resolveTauriPlatform(targetOs, targetArch);
  const desktopBundleDir = path.join(
    context.sourceRoot,
    context.packageDir,
    'dist',
    'tauri',
    tauriPlatform,
  );
  const desktopBundle = await findDesktopBundleArtifact(desktopBundleDir);
  if (!desktopBundle) {
    if (desktopReleaseMode === 'required') {
      throw new Error(`缺少桌面 bundle：${desktopBundleDir}`);
    }
  } else {
    const stagedDesktopAssetName = buildDesktopReleaseAssetName(
      context.releaseTag,
      tauriPlatform,
      desktopBundle.file,
    );
    const stagedDesktopAssetPath = path.join(artifactDir, stagedDesktopAssetName);
    await copyFile(
      path.join(desktopBundleDir, desktopBundle.file),
      stagedDesktopAssetPath,
    );
    checksumTargets.push(stagedDesktopAssetPath);

    const desktopManifestFragment = buildDesktopManifestFragment({
      releaseTag: context.releaseTag,
      version: context.publishVersion,
      tauriPlatform,
      file: stagedDesktopAssetName,
      sha256: (await buildSha256ChecksumLine(stagedDesktopAssetPath)).split(/\s+/)[0],
      size: (await stat(stagedDesktopAssetPath)).size,
      type: desktopBundle.type,
    });
    await writeJsonFile(
      path.join(artifactDir, `${context.releaseTag}-desktop-manifest-fragment.json`),
      desktopManifestFragment,
    );
  }

  await writeSha256Checksums(checksumTargets, checksumFile);
  await rm(stageDir, { recursive: true, force: true });

  process.stdout.write(`仅构建 ${targetOs}-${targetArch} Release 资产目录：${artifactDir}\n`);
}

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
