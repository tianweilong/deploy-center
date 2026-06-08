import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { createTempDir, removeDir, runNode } from './helpers.mjs';

test('print-docker-build-args 输出 docker buildx 参数列表', () => {
  const output = runNode(['scripts/print-docker-build-args.mjs'], {
    env: {
      BUILD_ARGS_JSON: JSON.stringify({ SOURCE_TAG: 'v2026.6.8-t1542', EMPTY: '' }),
    },
  });
  assert.equal(output, '--build-arg\nSOURCE_TAG=v2026.6.8-t1542\n--build-arg\nEMPTY=\n');
});

test('print-container-image-digest 从 buildx metadata 读取 digest', async () => {
  const tempDir = await createTempDir('deploy-center-digest-');
  try {
    const metadataPath = path.join(tempDir, 'metadata.json');
    await writeFile(
      metadataPath,
      JSON.stringify({ 'containerimage.digest': 'sha256:abc123' }),
      'utf8',
    );
    assert.equal(
      runNode(['scripts/print-container-image-digest.mjs', metadataPath]),
      'sha256:abc123',
    );
  } finally {
    await removeDir(tempDir);
  }
});
