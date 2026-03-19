import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertNotContains,
  createTempDir,
  readRepoFile,
  removeDir,
  runNode,
} from './helpers.mjs';

await assertNotContains(
  await readRepoFile('scripts/npm-release-common.mjs'),
  '[System.IO.Compression.ZipArchiveMode]',
);

const tempRoot = await createTempDir('deploy-center-zip-');
try {
  const sourceDir = path.join(tempRoot, 'source');
  const archivePath = path.join(tempRoot, 'manifest-only.zip');
  const validSourceDir = path.join(tempRoot, 'valid-source');
  const validArchivePath = path.join(tempRoot, 'valid.zip');

  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    path.join(sourceDir, 'manifest.json'),
    '{"schemaVersion":1,"platform":"windows-x64","targetOs":"win32","targetArch":"x64","files":["myte.exe"]}\n',
    'utf8',
  );

  assert.throws(
    () =>
      runNode([
        '--input-type=module',
        '-e',
        "import { createPlatformArchive } from './scripts/npm-release-common.mjs'; await createPlatformArchive(process.argv[1], process.argv[2], 'zip');",
        sourceDir,
        archivePath,
      ]),
    /zip 产物仅包含 manifest\.json，缺少平台文件/,
  );

  await mkdir(validSourceDir, { recursive: true });
  await writeFile(
    path.join(validSourceDir, 'manifest.json'),
    '{"schemaVersion":1,"platform":"windows-x64","targetOs":"win32","targetArch":"x64","files":["myte.exe"]}\n',
    'utf8',
  );
  await writeFile(path.join(validSourceDir, 'myte.exe'), 'fake binary\n', 'utf8');

  runNode([
    '--input-type=module',
    '-e',
    "import { createPlatformArchive } from './scripts/npm-release-common.mjs'; await createPlatformArchive(process.argv[1], process.argv[2], 'zip');",
    validSourceDir,
    validArchivePath,
  ]);

  runNode([
    '--input-type=module',
    '-e',
    "import { validateZipArchiveContents } from './scripts/npm-release-common.mjs'; await validateZipArchiveContents(process.argv[1]);",
    validArchivePath,
  ]);
} finally {
  await removeDir(tempRoot);
}
