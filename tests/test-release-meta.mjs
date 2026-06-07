import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReleaseMeta } from '../scripts/release-meta.mjs';

const baseInput = {
  packageName: '@vino.tian/vibe-kanban',
  publishVersion: '2026.4.19-1116',
  sourceTag: 'v2026.4.19-1116',
  distributionMode: 'github_release',
  releaseRepository: 'tianweilong/deploy-center',
};

test('calendar_tag 生成显式 releaseTag 与 packageVersion', () => {
  const meta = buildReleaseMeta(baseInput);

  assert.equal(meta.schemaVersion, 1);
  assert.equal(meta.packageName, '@vino.tian/vibe-kanban');
  assert.equal(meta.packageVersion, '2026.4.19-1116');
  assert.equal(meta.releaseRepository, 'tianweilong/deploy-center');
  assert.equal(meta.releaseTag, 'vibe-kanban-v2026.4.19-1116');
  assert.equal(meta.releasePackageKey, 'vibe-kanban');
  assert.equal(meta.distributionMode, 'github_release');
});

test('source_tag 包也生成显式 releaseTag', () => {
  const meta = buildReleaseMeta({
    packageName: '@vino.tian/myte',
    publishVersion: '0.2.3',
    sourceTag: 'v0.2.3',
    distributionMode: 'github_release',
    releaseRepository: 'tianweilong/deploy-center',
  });

  assert.equal(meta.releaseTag, 'myte-v0.2.3');
  assert.equal(meta.releasePackageKey, 'myte');
  assert.equal(meta.packageVersion, '0.2.3');
});

test('非法 distributionMode 直接失败', () => {
  assert.throws(
    () =>
      buildReleaseMeta({
        ...baseInput,
        distributionMode: 'unknown',
      }),
    /不支持的 distributionMode/
  );
});
