import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTempDir, removeDir, repoRoot, runNode } from './helpers.mjs';

const tempRoot = await createTempDir('deploy-center-merge-desktop-');
try {
  const releaseRoot = path.join(tempRoot, 'release-artifacts');
  const linuxDir = path.join(releaseRoot, 'npm-package-linux-x64');
  const macDir = path.join(releaseRoot, 'npm-package-darwin-arm64');

  await mkdir(linuxDir, { recursive: true });
  await mkdir(macDir, { recursive: true });

  const fragmentName = 'myte-v0.1.4-desktop-manifest-fragment.json';
  await writeFile(
    path.join(linuxDir, fragmentName),
    JSON.stringify(
      {
        releaseTag: 'myte-v0.1.4',
        version: '0.1.4',
        platforms: {
          'linux-x86_64': {
            file: 'myte-v0.1.4-linux-x86_64-Myte.AppImage.tar.gz',
            sha256: 'linux-sha',
            size: 11,
            type: 'appimage-tar-gz',
          },
        },
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    path.join(macDir, fragmentName),
    JSON.stringify(
      {
        releaseTag: 'myte-v0.1.4',
        version: '0.1.4',
        platforms: {
          'darwin-aarch64': {
            file: 'myte-v0.1.4-darwin-aarch64-Myte.app.tar.gz',
            sha256: 'mac-sha',
            size: 15,
            type: 'app-tar-gz',
          },
        },
      },
      null,
      2,
    ) + '\n',
  );

  runNode([path.join(repoRoot, 'scripts/merge-desktop-manifest.mjs'), releaseRoot], {
    cwd: repoRoot,
  });

  const manifestPath = path.join(releaseRoot, 'myte-v0.1.4-desktop-manifest.json');
  assert.ok((await stat(manifestPath)).isFile());

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(manifest, {
    version: '0.1.4',
    platforms: {
      'darwin-aarch64': {
        file: 'myte-v0.1.4-darwin-aarch64-Myte.app.tar.gz',
        sha256: 'mac-sha',
        size: 15,
        type: 'app-tar-gz',
      },
      'linux-x86_64': {
        file: 'myte-v0.1.4-linux-x86_64-Myte.AppImage.tar.gz',
        sha256: 'linux-sha',
        size: 11,
        type: 'appimage-tar-gz',
      },
    },
  });

  await assert.rejects(() => stat(path.join(linuxDir, fragmentName)));
  await assert.rejects(() => stat(path.join(macDir, fragmentName)));
} finally {
  await removeDir(tempRoot);
}
