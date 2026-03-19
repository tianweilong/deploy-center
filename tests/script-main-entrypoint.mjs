import assert from 'node:assert/strict';

import { isMainModule } from '../scripts/module-entrypoint.mjs';

assert.equal(
  isMainModule(
    'file:///D:/a/deploy-center/deploy-center/scripts/build-npm-release-assets.mjs',
    'D:\\a\\deploy-center\\deploy-center\\scripts\\build-npm-release-assets.mjs',
  ),
  true,
  'Windows 路径应被识别为主模块入口',
);

assert.equal(
  isMainModule(
    'file:///work/repo/scripts/build-npm-release-assets.mjs',
    '/work/repo/scripts/build-npm-release-assets.mjs',
  ),
  true,
  'Unix 路径应被识别为主模块入口',
);

assert.equal(
  isMainModule(
    'file:///work/repo/scripts/build-npm-release-assets.mjs',
    '/work/repo/scripts/other.mjs',
  ),
  false,
  '不同脚本路径不应被识别为主模块入口',
);
