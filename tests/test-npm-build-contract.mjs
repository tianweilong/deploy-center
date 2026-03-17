import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { validateBuildContract } from '../scripts/validate-npm-build-contract.mjs';

test('标准契约目录通过校验', async () => {
  const result = await validateBuildContract(
    'tests/fixtures/npm-contract/valid/linux-x64',
  );

  assert.deepEqual(result.files, ['myte']);
  assert.equal(result.manifest.platform, 'linux-x64');
});

test('声明文件缺失时校验失败', async () => {
  await assert.rejects(
    () =>
      validateBuildContract('tests/fixtures/npm-contract/missing-file/linux-x64'),
    /声明文件不存在/,
  );
});

test('platform 字段与目录名不一致时校验失败', async () => {
  await assert.rejects(
    () =>
      validateBuildContract(
        'tests/fixtures/npm-contract/platform-mismatch/linux-x64',
      ),
    /platform 字段与目录名不一致/,
  );
});

test('print-files 模式输出换行分隔的文件列表', () => {
  const result = spawnSync(
    'node',
    [
      'scripts/validate-npm-build-contract.mjs',
      '--print-files',
      'tests/fixtures/npm-contract/valid/linux-x64',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'myte');
});
