import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { createTempDir, removeDir, runNode } from './helpers.mjs';

test('detect-go-module 优先识别仓库根目录 go.mod', async () => {
  const tempDir = await createTempDir('deploy-center-go-');
  try {
    const sourceDir = path.join(tempDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(path.join(sourceDir, 'go.mod'), 'module example\n', 'utf8');
    const outputPath = path.join(tempDir, 'github-output.txt');

    runNode(['scripts/detect-go-module.mjs', sourceDir], {
      env: { GITHUB_OUTPUT: outputPath },
    });

    assert.equal(await readFile(outputPath, 'utf8'), `path=${sourceDir}/go.mod\n`);
  } finally {
    await removeDir(tempDir);
  }
});

test('detect-go-module 识别 go/go.mod 并在缺失时输出空路径', async () => {
  const tempDir = await createTempDir('deploy-center-go-');
  try {
    const sourceDir = path.join(tempDir, 'source');
    await mkdir(path.join(sourceDir, 'go'), { recursive: true });
    await writeFile(path.join(sourceDir, 'go', 'go.mod'), 'module example\n', 'utf8');
    const outputPath = path.join(tempDir, 'github-output.txt');

    runNode(['scripts/detect-go-module.mjs', sourceDir], {
      env: { GITHUB_OUTPUT: outputPath },
    });

    assert.equal(await readFile(outputPath, 'utf8'), `path=${sourceDir}/go/go.mod\n`);
  } finally {
    await removeDir(tempDir);
  }
});
