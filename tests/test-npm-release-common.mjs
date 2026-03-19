import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReleaseMetaPayload,
  parseSourceTagVersion,
  resolveCommandForSpawn,
  resolveDistPlatformDir,
  resolvePublishVersion,
  resolveSourcePath,
} from '../scripts/npm-release-common.mjs';

test('resolveSourcePath 返回绝对路径', () => {
  assert.equal(
    resolveSourcePath('/tmp/source', '../dist/output'),
    '/tmp/dist/output',
  );
});

test('resolveDistPlatformDir 映射目标平台目录', () => {
  assert.equal(resolveDistPlatformDir('linux', 'x64'), 'linux-x64');
  assert.equal(resolveDistPlatformDir('linux', 'arm64'), 'linux-arm64');
  assert.equal(resolveDistPlatformDir('win32', 'x64'), 'windows-x64');
  assert.equal(resolveDistPlatformDir('darwin', 'arm64'), 'macos-arm64');
});

test('resolveDistPlatformDir 对未知平台报错', () => {
  assert.throws(
    () => resolveDistPlatformDir('darwin', 'x64'),
    /不支持的 dist 平台目录映射/,
  );
});

test('parseSourceTagVersion 解析 vX.Y.Z 标签', () => {
  assert.deepEqual(parseSourceTagVersion('v1.2.30'), {
    major: 1,
    minor: 2,
    patch: 30,
    version: '1.2.30',
  });
});

test('resolvePublishVersion 支持 package_json 策略', () => {
  assert.equal(
    resolvePublishVersion({
      strategy: 'package_json',
      sourceTag: 'v1.2.30',
      packageVersion: '0.4.1',
    }),
    '0.4.1',
  );
});

test('resolvePublishVersion 支持 source_tag 策略', () => {
  assert.equal(
    resolvePublishVersion({
      strategy: 'source_tag',
      sourceTag: 'v1.2.30',
      packageVersion: '0.4.1',
    }),
    '1.2.30',
  );
});

test('resolvePublishVersion 支持 base_patch_offset 策略', () => {
  assert.equal(
    resolvePublishVersion({
      strategy: 'base_patch_offset',
      sourceTag: 'v0.1.3018',
      packageVersion: '0.1.3',
      baseVersion: '0.1.301',
      patchFactor: '10',
    }),
    '0.1.3018',
  );
});

test('resolvePublishVersion 对非法 patchFactor 报错', () => {
  assert.throws(
    () =>
      resolvePublishVersion({
        strategy: 'base_patch_offset',
        sourceTag: 'v0.1.3018',
        packageVersion: '0.1.3',
        baseVersion: '0.1.301',
        patchFactor: '0',
      }),
    /不是有效正整数/,
  );
});

test('buildReleaseMetaPayload 保持发布元数据契约', () => {
  assert.deepEqual(
    buildReleaseMetaPayload({
      packageName: '@vino.tian/myte',
      publishVersion: '0.2.3',
      sourceTag: 'v0.2.3',
    }),
    {
      packageName: '@vino.tian/myte',
      publishVersion: '0.2.3',
      sourceTag: 'v0.2.3',
      distributionMode: 'github_release',
      releaseRepository: 'tianweilong/deploy-center',
    },
  );
});

test('resolveCommandForSpawn 在 Windows 下为 npm 与 pnpm 使用 .cmd', () => {
  assert.equal(resolveCommandForSpawn('pnpm', 'win32'), 'pnpm.cmd');
  assert.equal(resolveCommandForSpawn('npm', 'win32'), 'npm.cmd');
  assert.equal(resolveCommandForSpawn('tar', 'win32'), 'tar');
});

test('resolveCommandForSpawn 在非 Windows 平台保持原命令', () => {
  assert.equal(resolveCommandForSpawn('pnpm', 'linux'), 'pnpm');
  assert.equal(resolveCommandForSpawn('npm', 'darwin'), 'npm');
});
