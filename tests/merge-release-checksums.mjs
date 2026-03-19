import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTempDir, removeDir, runNode } from './helpers.mjs';

const tempRoot = await createTempDir('deploy-center-checksums-');
try {
  const releaseRoot = path.join(tempRoot, 'release-artifacts');
  await mkdir(path.join(releaseRoot, 'npm-package-linux-x64'), { recursive: true });
  await mkdir(path.join(releaseRoot, 'npm-package-win32-x64'), { recursive: true });
  await mkdir(path.join(releaseRoot, 'npm-package-darwin-arm64'), { recursive: true });

  await writeFile(
    path.join(releaseRoot, 'npm-package-linux-x64', 'myte-v0.1.9-checksums.txt'),
    'sha-linux  myte-v0.1.9-linux-x64.tar.gz\n',
    'utf8',
  );
  await writeFile(
    path.join(releaseRoot, 'npm-package-win32-x64', 'myte-v0.1.9-checksums.txt'),
    'sha-win  myte-v0.1.9-win32-x64.zip\n',
    'utf8',
  );
  await writeFile(
    path.join(releaseRoot, 'npm-package-darwin-arm64', 'myte-v0.1.9-checksums.txt'),
    'sha-darwin  myte-v0.1.9-darwin-arm64.tar.gz\n',
    'utf8',
  );

  runNode(['scripts/merge-release-checksums.mjs', releaseRoot]);

  const mergedFile = path.join(releaseRoot, 'myte-v0.1.9-checksums.txt');
  const content = await readFile(mergedFile, 'utf8');
  assert.match(content, /myte-v0\.1\.9-linux-x64\.tar\.gz/);
  assert.match(content, /myte-v0\.1\.9-win32-x64\.zip/);
  assert.match(content, /myte-v0\.1\.9-darwin-arm64\.tar\.gz/);
  assert.equal(
    content.trim().split('\n').length,
    3,
    '合并后的校验文件应包含 3 条平台记录。',
  );
} finally {
  await removeDir(tempRoot);
}
