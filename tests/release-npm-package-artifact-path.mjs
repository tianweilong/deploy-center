import assert from 'node:assert/strict';
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { createTempDir, removeDir, repoRoot, runNode } from './helpers.mjs';

const tempRoot = await createTempDir('deploy-center-artifact-');
try {
  const workspaceRoot = path.join(tempRoot, 'workspace');
  const sourceRoot = path.join(workspaceRoot, 'source');
  const artifactRoot = path.join(workspaceRoot, 'npm-artifacts', 'linux-x64');
  const fixtureSource = path.join(repoRoot, 'tests/fixtures/release-npm-package-source');

  await mkdir(workspaceRoot, { recursive: true });
  await cp(fixtureSource, sourceRoot, { recursive: true });
  await removeDir(path.join(sourceRoot, 'npm-artifacts'));

  runNode([path.join(repoRoot, 'scripts/build-npm-release-assets.mjs'), 'source'], {
    cwd: workspaceRoot,
    env: {
      BUILD_ONLY: 'true',
      TARGET_OS: 'linux',
      TARGET_ARCH: 'x64',
      ARCHIVE_EXT: 'tar.gz',
      BUILD_ARTIFACT_DIR: '../npm-artifacts/linux-x64',
      SOURCE_TAG: 'v0.1.4',
      NPM_PACKAGE_NAME: '@vino.tian/myte',
      NPM_PACKAGE_DIR: 'npm/myte',
      NPM_VERSION_STRATEGY: 'source_tag',
    },
  });

  assert.ok((await stat(artifactRoot)).isDirectory(), `期望在工作目录生成平台产物目录：${artifactRoot}`);
  await assert.rejects(() => stat(path.join(sourceRoot, 'npm-artifacts')));
  await assert.rejects(() => stat(path.join(artifactRoot, 'stage')));

  const files = await readdir(artifactRoot);
  assert.ok(files.includes('myte-v0.1.4-linux-x64.tar.gz'));
  assert.ok(files.includes('myte-v0.1.4-checksums.txt'));
} finally {
  await removeDir(tempRoot);
}
