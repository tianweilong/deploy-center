import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTempDir, removeDir, repoRoot, runNode } from './helpers.mjs';

test('config/services.yaml 定义 deploy-center 当前发布服务', async () => {
  const content = await readFile(path.join(repoRoot, 'config/services.yaml'), 'utf8');

  assert.match(content, /^services:\n/m);
  for (const serviceName of [
    'cli-proxy-api',
    'postgres17',
    'azure-storage-azurite',
    'azure-cli',
    'electricsql-electric',
    'nginx',
    'bitwarden',
    'redis7',
    'searxng',
    'lobehub',
    'new-api',
    'vibe-kanban-remote',
    'vibe-kanban-relay',
    'we-mp-rss',
    'vibe-kanban-npm',
  ]) {
    assert.match(content, new RegExp(`^  ${serviceName}:`, 'm'));
  }
});

test('旧服务配置和矩阵脚本已移除', async () => {
  const configEntries = await readdir(path.join(repoRoot, 'config'));
  assert.deepEqual(
    configEntries.filter((entry) => /^services\..*\.json$/.test(entry)).sort(),
    [],
  );
  await assert.rejects(() => stat(path.join(repoRoot, 'scripts/prepare-release-matrix.mjs')));
});

async function runResolver(payload) {
  const tempRoot = await createTempDir('deploy-center-resolve-release-');
  const payloadPath = path.join(tempRoot, 'payload.json');
  await writeFile(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  try {
    const stdout = runNode([
      'scripts/resolve-release-request.mjs',
      'config/services.yaml',
      payloadPath,
    ]);
    return JSON.parse(stdout);
  } finally {
    await removeDir(tempRoot);
  }
}

test('resolve-release-request 解析镜像服务上下文', async () => {
  const resolved = await runResolver({
    service_name: 'vibe-kanban-remote',
    source_ref: 'refs/tags/v2026.4.19-1116',
    source_sha: '0123456789abcdef0123456789abcdef01234567',
    source_tag: 'v2026.4.19-1116',
  });

  assert.equal(resolved.service_name, 'vibe-kanban-remote');
  assert.equal(resolved.source_repository, 'tianweilong/vibe-kanban');
  assert.equal(resolved.image_tag, 'v2026.4.19-1116');
  assert.equal(resolved.ghcr_image_repository, 'ghcr.io/tianweilong/vibe-kanban-remote');
  assert.deepEqual(resolved.platforms, ['linux/amd64', 'linux/arm64']);
  assert.equal(resolved.has_image, true);
  assert.equal(resolved.has_npm, false);
});

test('resolve-release-request 保留镜像构建参数', async () => {
  const tempRoot = await createTempDir('deploy-center-resolve-build-args-');
  const configPath = path.join(tempRoot, 'services.yaml');
  const payloadPath = path.join(tempRoot, 'payload.json');
  await writeFile(
    configPath,
    `services:
  app:
    sourceRepository: tianweilong/example
    buildContext: .
    dockerfilePath: Dockerfile
    ghcrImageRepository: ghcr.io/tianweilong/example
    defaultPlatforms:
      - linux/amd64
    buildArgs:
      VERSION: v2026.4.19-1116
      FEATURE_FLAG: enabled
`,
    'utf8',
  );
  await writeFile(
    payloadPath,
    `${JSON.stringify(
      {
        service_name: 'app',
        source_ref: 'refs/tags/v2026.4.19-1116',
        source_sha: '0123456789abcdef0123456789abcdef01234567',
        source_tag: 'v2026.4.19-1116',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  try {
    const stdout = runNode(['scripts/resolve-release-request.mjs', configPath, payloadPath]);
    const resolved = JSON.parse(stdout);

    assert.deepEqual(resolved.build_args, {
      VERSION: 'v2026.4.19-1116',
      FEATURE_FLAG: 'enabled',
    });
  } finally {
    await removeDir(tempRoot);
  }
});

test('resolve-release-request 解析 npm calendar 发布上下文', async () => {
  const resolved = await runResolver({
    service_name: 'vibe-kanban-npm',
    source_ref: 'refs/tags/v2026.4.19-1116',
    source_sha: '0123456789abcdef0123456789abcdef01234567',
    source_tag: 'v2026.4.19-1116',
  });

  assert.equal(resolved.has_image, false);
  assert.equal(resolved.has_npm, true);
  assert.equal(resolved.npm_package_name, '@vino.tian/vibe-kanban');
  assert.equal(resolved.npm_package_dir, 'npx-cli');
  assert.equal(resolved.npm_version_strategy, 'calendar_tag');
  assert.equal(resolved.npm_dist_tag, 'latest');
  assert.equal(resolved.npm_publish_version, '2026.4.19-1116');
  assert.equal(resolved.npm_platforms.length, 4);
});

async function runResolverFailure(payload) {
  const tempRoot = await createTempDir('deploy-center-resolve-release-fail-');
  const payloadPath = path.join(tempRoot, 'payload.json');
  await writeFile(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  try {
    assert.throws(
      () => runNode(['scripts/resolve-release-request.mjs', 'config/services.yaml', payloadPath]),
      /source_tag must match vYYYY\.M\.D-HHmm/,
    );
  } finally {
    await removeDir(tempRoot);
  }
}

test('resolve-release-request 拒绝旧 tag 格式', async () => {
  const basePayload = {
    service_name: 'vibe-kanban-remote',
    source_ref: 'refs/tags/v2026.4.19-1116',
    source_sha: '0123456789abcdef0123456789abcdef01234567',
  };

  await runResolverFailure({ ...basePayload, source_tag: 'latest' });
  await runResolverFailure({ ...basePayload, source_tag: 'v1.2.3' });
  await runResolverFailure({ ...basePayload, source_tag: '2026.04.19.1' });
});
