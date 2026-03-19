import assert from 'node:assert/strict';
import path from 'node:path';

import { createTempDir, removeDir, runNode, writeTempFile } from './helpers.mjs';

function buildMatrix(args, env) {
  return JSON.parse(
    runNode(['scripts/prepare-release-matrix.mjs', ...args], {
      env,
    }),
  );
}

const defaultEnv = {
  DEFAULT_IMAGE_PLATFORMS: 'linux/amd64,linux/arm64',
};

const matrix = buildMatrix(['config/services.vibe-kanban.json'], {
  ...defaultEnv,
  TARGET_SERVICES: 'vibe-kanban-remote,vibe-kanban-relay',
  SOURCE_TAG: 'v1.2.3',
});

assert.equal(matrix.include.length, 2, '应返回两个服务');
const remote = matrix.include.find((item) => item.service === 'vibe-kanban-remote');
const relay = matrix.include.find((item) => item.service === 'vibe-kanban-relay');
assert.ok(remote, '缺少 remote 服务');
assert.ok(relay, '缺少 relay 服务');
assert.equal(remote.image_repository, 'ghcr.io/tianweilong/vibe-kanban-remote');
assert.equal(relay.image_repository, 'ghcr.io/tianweilong/vibe-kanban-relay');
assert.equal(remote.platforms, 'linux/amd64,linux/arm64');
assert.equal(relay.platforms, 'linux/amd64,linux/arm64');
assert.deepEqual(remote.build_args, []);
assert.deepEqual(relay.build_args, []);
assert.equal(remote.tag, 'v1.2.3');

const newApiMatrix = buildMatrix(['config/services.new-api.json'], {
  ...defaultEnv,
  TARGET_SERVICES: 'new-api',
  SOURCE_TAG: 'v2.3.4',
});
assert.equal(newApiMatrix.include.length, 1, 'new-api 应只返回一个服务');
const newApi = newApiMatrix.include[0];
assert.equal(newApi.service, 'new-api');
assert.equal(newApi.image_repository, 'ghcr.io/tianweilong/new-api');
assert.equal(newApi.dockerfile, 'Dockerfile');
assert.equal(newApi.platforms, 'linux/amd64,linux/arm64');
assert.deepEqual(newApi.build_args, []);
assert.equal(newApi.tag, 'v2.3.4');

const tempRoot = await createTempDir('deploy-center-matrix-');
try {
  const overrideConfig = path.join(tempRoot, 'override.json');
  await writeTempFile(
    overrideConfig,
    `${JSON.stringify(
      {
        project: 'vibe-kanban',
        services: [
          {
            service: 'vibe-kanban-relay',
            image_repository: 'ghcr.io/tianweilong/vibe-kanban-relay',
            context: 'source',
            dockerfile: 'crates/relay-tunnel/Dockerfile',
            platforms: 'linux/arm64',
            build_args: [],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const overrideMatrix = buildMatrix([overrideConfig], {
    ...defaultEnv,
    TARGET_SERVICES: 'vibe-kanban-relay',
    SOURCE_TAG: 'v1.2.3',
  });
  assert.equal(
    overrideMatrix.include[0].platforms,
    'linux/arm64',
    '服务显式平台覆盖失效',
  );

  const dockerImagesConfig = path.join(tempRoot, 'docker-images.json');
  await writeTempFile(
    dockerImagesConfig,
    `${JSON.stringify(
      {
        project: 'docker-images',
        services: [
          {
            service: 'image-a',
            image_repository: 'ghcr.io/tianweilong/image-a',
            context: 'source/images/image-a',
            dockerfile: 'Dockerfile',
            build_args: [],
          },
          {
            service: 'image-b',
            image_repository: 'ghcr.io/tianweilong/image-b',
            context: 'source/images/image-b',
            dockerfile: 'Dockerfile',
            build_args: [],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const dockerImagesMatrix = buildMatrix([dockerImagesConfig], {
    ...defaultEnv,
    TARGET_SERVICES: 'image-a,image-b',
    SOURCE_TAG: 'latest',
  });
  assert.equal(dockerImagesMatrix.include.length, 2, 'docker-images 应返回两个服务');
  const imageA = dockerImagesMatrix.include.find((item) => item.service === 'image-a');
  const imageB = dockerImagesMatrix.include.find((item) => item.service === 'image-b');
  assert.ok(imageA, '缺少 image-a 服务');
  assert.ok(imageB, '缺少 image-b 服务');
  assert.equal(imageA.context, 'source/images/image-a');
  assert.equal(imageB.context, 'source/images/image-b');
  assert.equal(imageA.tag, 'latest');
  assert.equal(imageB.tag, 'latest');
} finally {
  await removeDir(tempRoot);
}

const dockerMirrorMatrix = buildMatrix(['config/services.docker-mirror.json'], {
  ...defaultEnv,
  TARGET_SERVICES:
    'postgres16,azure-storage-azurite,azure-cli,electricsql-electric,nginx,bitwarden',
  SOURCE_TAG: 'latest',
});
assert.equal(dockerMirrorMatrix.include.length, 6, 'docker-mirror 应返回六个服务');
const bitwarden = dockerMirrorMatrix.include.find((item) => item.service === 'bitwarden');
const postgres16 = dockerMirrorMatrix.include.find((item) => item.service === 'postgres16');
assert.ok(bitwarden, '缺少 bitwarden 服务');
assert.ok(postgres16, '缺少 postgres16 服务');
assert.equal(bitwarden.image_repository, 'ghcr.io/tianweilong/bitwarden');
assert.equal(bitwarden.context, 'source/images/bitwarden');
assert.equal(bitwarden.dockerfile, 'Dockerfile');
assert.equal(bitwarden.platforms, 'linux/amd64,linux/arm64');
assert.deepEqual(bitwarden.build_args, []);
assert.equal(bitwarden.tag, 'latest');
assert.equal(postgres16.image_repository, 'ghcr.io/tianweilong/postgres16');
