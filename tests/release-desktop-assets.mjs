import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { createTempDir, removeDir, repoRoot, runNode } from './helpers.mjs';

const tempRoot = await createTempDir('deploy-center-desktop-asset-');
try {
  const workspaceRoot = path.join(tempRoot, 'workspace');
  const sourceRoot = path.join(workspaceRoot, 'source');
  const artifactRoot = path.join(workspaceRoot, 'npm-artifacts', 'darwin-arm64');
  const fixtureSource = path.join(repoRoot, 'tests/fixtures/release-npm-package-source');

  await mkdir(workspaceRoot, { recursive: true });
  await cp(fixtureSource, sourceRoot, { recursive: true });

  runNode([path.join(repoRoot, 'scripts/build-npm-release-assets.mjs'), 'source'], {
    cwd: workspaceRoot,
    env: {
      BUILD_ONLY: 'true',
      BUILD_DESKTOP_BUNDLE: 'true',
      DESKTOP_RELEASE_MODE: 'required',
      TARGET_OS: 'darwin',
      TARGET_ARCH: 'arm64',
      ARCHIVE_EXT: 'tar.gz',
      BUILD_ARTIFACT_DIR: '../npm-artifacts/darwin-arm64',
      SOURCE_TAG: 'v0.1.4',
      NPM_PACKAGE_NAME: '@vino.tian/myte',
      NPM_PACKAGE_DIR: 'npm/myte',
      NPM_VERSION_STRATEGY: 'source_tag',
    },
  });

  assert.ok(
    (await stat(artifactRoot)).isDirectory(),
    `期望在工作目录生成平台产物目录：${artifactRoot}`,
  );

  const files = await readdir(artifactRoot);
  assert.ok(files.includes('myte-v0.1.4-darwin-arm64.tar.gz'));
  assert.ok(files.includes('myte-v0.1.4-checksums.txt'));
  assert.ok(files.includes('myte-v0.1.4-desktop-manifest-fragment.json'));
  assert.ok(files.includes('myte-v0.1.4-darwin-aarch64-Myte.app.tar.gz'));

  const checksums = await readFile(
    path.join(artifactRoot, 'myte-v0.1.4-checksums.txt'),
    'utf8',
  );
  assert.match(checksums, /myte-v0\.1\.4-darwin-arm64\.tar\.gz/);
  assert.match(checksums, /myte-v0\.1\.4-darwin-aarch64-Myte\.app\.tar\.gz/);

  const fragment = JSON.parse(
    await readFile(
      path.join(artifactRoot, 'myte-v0.1.4-desktop-manifest-fragment.json'),
      'utf8',
    ),
  );
  assert.deepEqual(fragment, {
    releaseTag: 'myte-v0.1.4',
    version: '0.1.4',
    platforms: {
      'darwin-aarch64': {
        file: 'myte-v0.1.4-darwin-aarch64-Myte.app.tar.gz',
        sha256: '8f4d9ee223b9e62815d01cf8e4cc961a8b48f6ea4e4b5a7346a0dff6ffb6590b',
        size: 15,
        type: 'app-tar-gz',
      },
    },
  });
} finally {
  await removeDir(tempRoot);
}
