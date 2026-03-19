import assert from 'node:assert/strict';

import { runNode } from './helpers.mjs';

const output = runNode(['scripts/prepare-release-matrix.mjs', 'config/services.new-api.json'], {
  env: {
    TARGET_SERVICES: 'new-api',
    SOURCE_TAG: 'v1.2.3',
    DEFAULT_IMAGE_PLATFORMS: 'linux/amd64,linux/arm64',
  },
});

const data = JSON.parse(output);
assert.equal(data.include.length, 1, 'new-api 应只返回一个服务');

const item = data.include[0];
assert.equal(item.service, 'new-api');
assert.equal(item.image_repository, 'ghcr.io/tianweilong/new-api');
assert.equal(item.context, 'source');
assert.equal(item.dockerfile, 'Dockerfile');
assert.equal(item.platforms, 'linux/amd64,linux/arm64');
assert.deepEqual(item.build_args, []);
assert.equal(item.tag, 'v1.2.3');
