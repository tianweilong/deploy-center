import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDockerBuildxArgs } from '../scripts/build-and-push-image-digest.mjs';

const baseEnv = {
  SOURCE_REPOSITORY: 'tianweilong/docker-mirror',
  BUILD_CONTEXT: 'images/postgres17',
  DOCKERFILE_PATH: 'images/postgres17/Dockerfile',
  GHCR_IMAGE_REPOSITORY: 'ghcr.io/tianweilong/paradedb-pg17',
  PLATFORM: 'linux/amd64',
};

test('buildDockerBuildxArgs 在 buildArgs 为空时不产生空参数', () => {
  const args = buildDockerBuildxArgs({ ...baseEnv, BUILD_ARGS_JSON: '{}' }, '/tmp/metadata.json');
  assert.ok(!args.includes(''), 'docker buildx 参数不应包含空字符串');
  assert.ok(!args.includes('--build-arg'), '空 buildArgs 不应传 --build-arg');
  assert.deepEqual(args.slice(-2), ['/tmp/metadata.json', 'images/postgres17']);
});

test('buildDockerBuildxArgs 保留配置里的 buildArgs', () => {
  const args = buildDockerBuildxArgs(
    {
      ...baseEnv,
      BUILD_ARGS_JSON: JSON.stringify({ VERSION: 'v2026.6.8-t1542', COMMIT: 'abc123' }),
    },
    '/tmp/metadata.json',
  );
  assert.deepEqual(args.slice(0, 4), [
    '--build-arg',
    'VERSION=v2026.6.8-t1542',
    '--build-arg',
    'COMMIT=abc123',
  ]);
});
