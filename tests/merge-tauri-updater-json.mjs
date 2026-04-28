import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTempDir, removeDir, repoRoot, runNode } from './helpers.mjs';

const tempRoot = await createTempDir('deploy-center-merge-updater-');
try {
  const releaseRoot = path.join(tempRoot, 'release-artifacts');
  const linuxDir = path.join(releaseRoot, 'npm-package-linux-x64');
  const macDir = path.join(releaseRoot, 'npm-package-darwin-arm64');

  await mkdir(linuxDir, { recursive: true });
  await mkdir(macDir, { recursive: true });

  const fragmentName = 'myte-v0.1.4-tauri-updater-fragment.json';
  await writeFile(
    path.join(linuxDir, fragmentName),
    JSON.stringify(
      {
        packageKey: 'myte',
        releaseTag: 'myte-v0.1.4',
        version: '0.1.4',
        platforms: {
          'linux-x86_64': {
            file: 'myte-v0.1.4-linux-x86_64-Myte.AppImage.tar.gz',
            signature: 'linux-signature',
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
        packageKey: 'myte',
        releaseTag: 'myte-v0.1.4',
        version: '0.1.4',
        platforms: {
          'darwin-aarch64': {
            file: 'myte-v0.1.4-darwin-aarch64-Myte.app.tar.gz',
            signature: 'mac-signature',
          },
        },
      },
      null,
      2,
    ) + '\n',
  );

  runNode(
    [
      path.join(repoRoot, 'scripts/merge-tauri-updater-json.mjs'),
      releaseRoot,
      'tianweilong/deploy-center',
    ],
    {
      cwd: repoRoot,
    },
  );

  const updaterPath = path.join(releaseRoot, 'myte-updater.json');
  assert.ok((await stat(updaterPath)).isFile());

  const updater = JSON.parse(await readFile(updaterPath, 'utf8'));
  assert.equal(updater.version, '0.1.4');
  assert.equal(typeof updater.pub_date, 'string');
  assert.ok(!Number.isNaN(Date.parse(updater.pub_date)));
  assert.deepEqual(updater.platforms, {
    'darwin-aarch64': {
      signature: 'mac-signature',
      url: 'https://github.com/tianweilong/deploy-center/releases/download/myte-v0.1.4/myte-v0.1.4-darwin-aarch64-Myte.app.tar.gz',
    },
    'linux-x86_64': {
      signature: 'linux-signature',
      url: 'https://github.com/tianweilong/deploy-center/releases/download/myte-v0.1.4/myte-v0.1.4-linux-x86_64-Myte.AppImage.tar.gz',
    },
  });

  await assert.rejects(() => stat(path.join(linuxDir, fragmentName)));
  await assert.rejects(() => stat(path.join(macDir, fragmentName)));
} finally {
  await removeDir(tempRoot);
}
