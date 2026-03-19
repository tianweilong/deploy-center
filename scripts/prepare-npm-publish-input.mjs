#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  copyPackageDirectory,
  initNpmReleaseContext,
  recreateDir,
  resolveSourcePath,
  runCommand,
  writeJsonFile,
} from './npm-release-common.mjs';
import { isMainModule } from './module-entrypoint.mjs';
import { buildReleaseMeta } from './release-meta.mjs';

async function writeManifestText(outputDir) {
  await writeFile(
    path.join(outputDir, 'manifest.txt'),
    'publish-context.json\npackage/package.json\npackage/release-meta.json\n',
    'utf8',
  );
}

async function main() {
  const sourceDir = process.argv[2] ?? 'source';
  const outputDirInput = process.env.OUTPUT_DIR ?? '../npm-publish-input';
  const context = await initNpmReleaseContext(sourceDir);
  const outputDir = resolveSourcePath(context.sourceRoot, outputDirInput);
  const sourcePackageDir = path.join(context.sourceRoot, context.packageDir);
  const packageDir = path.join(outputDir, 'package');

  await runCommand('pnpm', ['i', '--frozen-lockfile'], {
    cwd: context.sourceRoot,
  });
  await writeJsonFile(
    path.join(sourcePackageDir, 'release-meta.json'),
    buildReleaseMeta(context.releaseMetaPayload),
  );
  await runCommand(
    'npm',
    [
      'version',
      context.publishVersion,
      '--no-git-tag-version',
      '--allow-same-version',
    ],
    { cwd: sourcePackageDir },
  );
  await runCommand('pnpm', ['run', 'build:npx'], {
    cwd: context.sourceRoot,
  });

  await recreateDir(outputDir);
  await copyPackageDirectory(sourcePackageDir, packageDir);
  await writeJsonFile(path.join(outputDir, 'publish-context.json'), {
    packageName: context.actualPackageName,
    publishVersion: context.publishVersion,
    sourceTag: context.sourceTag,
    releaseTag: context.releaseTag,
    releasePackageKey: context.releasePackageKey,
    packageDir: 'package',
  });
  await writeManifestText(outputDir);

  process.stdout.write(`已生成 npm 发布输入目录：${outputDir}\n`);
}

if (isMainModule(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
