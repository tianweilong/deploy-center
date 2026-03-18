# npm 分发规范统一 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统一 `deploy-center`、`vibe-kanban`、`myte` 的 npm 分发协议，引入显式 `release-meta.json`，正式发布使用轻量安装器包，本地开发使用自包含包，彻底消除 release tag 猜测错误和本地打包缺少 `dist` 的问题。

**Architecture:** `deploy-center` 负责计算最终 npm 版本并生成唯一可信的 `release-meta.json`，其中包含 `releaseTag`、`releaseRepository` 与 `distributionMode`。`vibe-kanban` 和 `myte` 的运行时代码都改为只读取该元数据，而不是从 `package.json` 隐式推导。源仓库新增独立的本地自包含打包入口，写入 `distributionMode=bundled_dist` 并随包携带 `dist`。全程按 TDD 推进，先锁定失败测试，再写最小实现。

**Tech Stack:** GitHub Actions YAML、Bash、Node.js、pnpm、TypeScript、shell tests、Node tests

---

### Task 1: 为 deploy-center 锁定发布元数据协议

**Files:**
- Create: `deploy-center/tests/test-release-meta.mjs`
- Test: `deploy-center/tests/test-release-meta.mjs`

**Step 1: Write the failing test**

创建 `deploy-center/tests/test-release-meta.mjs`，先锁定一个纯函数接口，例如：

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReleaseMeta } from '../scripts/release-meta.mjs';

test('base_patch_offset 生成显式 releaseTag 与 packageVersion', () => {
  const meta = buildReleaseMeta({
    packageName: '@vino.tian/vibe-kanban',
    publishVersion: '0.1.3018',
    sourceTag: 'v0.1.3018',
    distributionMode: 'github_release',
    releaseRepository: 'tianweilong/deploy-center',
  });

  assert.equal(meta.releaseTag, 'vibe-kanban-v0.1.3018');
  assert.equal(meta.packageVersion, '0.1.3018');
  assert.equal(meta.releasePackageKey, 'vibe-kanban');
  assert.equal(meta.distributionMode, 'github_release');
});
```

再补一条 `source_tag` 场景，锁定 `@vino.tian/myte` -> `myte-vX.Y.Z`。

**Step 2: Run test to verify it fails**

Run: `cd deploy-center && node --test tests/test-release-meta.mjs`
Expected: FAIL，因为 `scripts/release-meta.mjs` 尚不存在。

**Step 3: Keep production code unchanged**

此时不写实现，只确认失败原因正确。

### Task 2: 实现 deploy-center 的发布元数据生成器

**Files:**
- Create: `deploy-center/scripts/release-meta.mjs`
- Modify: `deploy-center/tests/test-release-meta.mjs`
- Test: `deploy-center/tests/test-release-meta.mjs`

**Step 1: Write one more failing test**

在 `deploy-center/tests/test-release-meta.mjs` 中增加非法模式测试：

```js
test('非法 distributionMode 直接失败', () => {
  assert.throws(
    () => buildReleaseMeta({ ...baseInput, distributionMode: 'unknown' }),
    /不支持的 distributionMode/
  );
});
```

**Step 2: Run test to verify it fails**

Run: `cd deploy-center && node --test tests/test-release-meta.mjs`
Expected: FAIL，因为实现不存在。

**Step 3: Write minimal implementation**

创建 `deploy-center/scripts/release-meta.mjs`，导出 `buildReleaseMeta`。最小实现需要：

- 从 `packageName` 推导 `releasePackageKey`
- 校验 `distributionMode` 只能是 `github_release` 或 `bundled_dist`
- 生成如下对象：

```js
{
  schemaVersion: 1,
  packageName,
  packageVersion: publishVersion,
  releaseRepository,
  releaseTag: `${releasePackageKey}-${sourceTag}`,
  releasePackageKey,
  distributionMode,
}
```

**Step 4: Run test to verify it passes**

Run: `cd deploy-center && node --test tests/test-release-meta.mjs`
Expected: PASS

### Task 3: 让 release-npm-package.sh 在发布前写入 `release-meta.json`

**Files:**
- Modify: `deploy-center/scripts/release-npm-package.sh`
- Modify: `deploy-center/tests/npm-release-workflow.sh`
- Test: `deploy-center/tests/npm-release-workflow.sh`
- Test: `deploy-center/tests/test-release-meta.mjs`

**Step 1: Write the failing test**

在 `deploy-center/tests/npm-release-workflow.sh` 增加断言，要求脚本：

- 引用 `release-meta.mjs`
- 在 `npm version` 之前写入 `release-meta.json`
- 不再让运行时依赖 `package.json.repository` 推导 release tag

最小断言示例：

```bash
grep -q 'release-meta.mjs' "$script"
grep -q 'release-meta.json' "$script"
grep -q 'distributionMode' "$script"
```

**Step 2: Run test to verify it fails**

Run: `cd deploy-center && bash tests/npm-release-workflow.sh`
Expected: FAIL，因为脚本当前还不会写入 `release-meta.json`。

**Step 3: Write minimal implementation**

修改 `deploy-center/scripts/release-npm-package.sh`：

- 计算 `PUBLISH_VERSION` 后调用 `node scripts/release-meta.mjs ...`
- 在 `${NPM_PACKAGE_DIR}/release-meta.json` 写入：
  - `packageName`
  - `packageVersion`
  - `releaseRepository`
  - `releaseTag`
  - `releasePackageKey`
  - `distributionMode=github_release`
- `BUILD_ONLY=true` 分支不必写本地自包含元数据，但正式发布分支必须写

如有必要，为 `release-meta.mjs` 增加 CLI：

```bash
node scripts/release-meta.mjs write path/to/release-meta.json
```

**Step 4: Run tests to verify they pass**

Run: `cd deploy-center && bash tests/npm-release-workflow.sh && node --test tests/test-release-meta.mjs`
Expected: PASS

### Task 4: 用失败测试锁定 vibe-kanban 运行时只读显式元数据

**Files:**
- Modify: `vibe-kanban/npx-cli/src/release-assets.test.ts`
- Modify: `vibe-kanban/npx-cli/src/platform.test.ts`
- Test: `vibe-kanban/npx-cli/src/release-assets.test.ts`

**Step 1: Write the failing test**

在 `vibe-kanban/npx-cli/src/release-assets.test.ts` 中增加用例，锁定：

- 当 `release-meta.json` 中 `releaseTag=vibe-kanban-v0.1.3018` 时
- checksums 文件名必须是 `vibe-kanban-v0.1.3018-checksums.txt`
- 资产 URL 必须指向 `tianweilong/deploy-center`

再补一条用例，锁定 `distributionMode=bundled_dist` 时不生成 GitHub Release URL。

**Step 2: Run test to verify it fails**

Run: `cd vibe-kanban/npx-cli && npm test -- --runInBand release-assets`
Expected: FAIL，因为当前实现仍从 `package.json` 推导版本和仓库。

**Step 3: Keep implementation unchanged**

此时不改实现，只确认失败来自新增约束。

### Task 5: 实现 vibe-kanban 的 `release-meta.json` 读取与双模式分发

**Files:**
- Modify: `vibe-kanban/npx-cli/src/download.ts`
- Modify: `vibe-kanban/npx-cli/src/release-assets.ts`
- Create: `vibe-kanban/npx-cli/src/release-meta.ts`
- Modify: `vibe-kanban/npx-cli/package.json`
- Test: `vibe-kanban/npx-cli/src/release-assets.test.ts`
- Test: `vibe-kanban/npx-cli/src/platform.test.ts`

**Step 1: Write one more failing test**

增加读取失败测试，锁定 `release-meta.json` 缺失或字段不合法时给出清晰中文错误。

**Step 2: Run test to verify it fails**

Run: `cd vibe-kanban/npx-cli && npm test -- --runInBand release-assets`
Expected: FAIL

**Step 3: Write minimal implementation**

实现 `src/release-meta.ts`，负责：

- 读取 `../release-meta.json`
- 校验 `schemaVersion`
- 返回标准化元数据对象

修改 `src/download.ts`：

- 删除 `BINARY_TAG`、`GITHUB_RELEASE_REPOSITORY`、`GITHUB_RELEASE_TAG` 的隐式推导
- 改为从 `release-meta.json` 读取
- 若 `distributionMode=bundled_dist`，直接读取包内 `dist`
- 若 `distributionMode=github_release`，按显式 `releaseTag` 下载资产

修改 `src/release-assets.ts`：

- 保持资产命名函数纯函数化
- 输入参数改为显式 `releaseTag` 与 `releasePackageKey`

更新 `npx-cli/package.json`：

- 确保 `files` 包含 `release-meta.json`
- 正式轻量包不包含 `dist`

**Step 4: Run test to verify it passes**

Run: `cd vibe-kanban/npx-cli && npm test -- --runInBand release-assets`
Expected: PASS

### Task 6: 为 vibe-kanban 增加本地自包含打包入口

**Files:**
- Modify: `vibe-kanban/package.json`
- Modify: `vibe-kanban/local-build.sh`
- Create: `vibe-kanban/scripts/pack-npx-local.mjs`
- Test: `vibe-kanban/scripts/pack-npx-local.mjs`

**Step 1: Write the failing test**

创建最小 smoke test，执行本地打包后断言：

- `npx-cli/release-meta.json` 中 `distributionMode=bundled_dist`
- 生成的包内包含 `dist`
- 运行时不会尝试访问 GitHub Release

如果当前没有统一测试框架，可先用 `node` 脚本断言 tarball 文件列表。

**Step 2: Run test to verify it fails**

Run: `cd vibe-kanban && node scripts/test-pack-npx-local.mjs`
Expected: FAIL，因为本地打包入口尚不存在。

**Step 3: Write minimal implementation**

创建 `scripts/pack-npx-local.mjs`：

- 先确保 `npx-cli/dist` 已构建
- 写入 `distributionMode=bundled_dist` 的 `release-meta.json`
- 调用 `npm pack` 或等价逻辑生成本地自包含包

在根 `package.json` 增加：

```json
{
  "scripts": {
    "pack:npx-local": "node scripts/pack-npx-local.mjs"
  }
}
```

必要时调整 `npx-cli/package.json.files`，让本地打包入口显式包含 `dist`

**Step 4: Run test to verify it passes**

Run: `cd vibe-kanban && node scripts/test-pack-npx-local.mjs`
Expected: PASS

### Task 7: 用失败测试锁定 myte 读取统一元数据协议

**Files:**
- Modify: `myte/scripts/test-build-npx-contract.mjs`
- Modify: `myte/scripts/check-release-workflow.sh`
- Test: `myte/scripts/test-build-npx-contract.mjs`

**Step 1: Write the failing test**

增加断言，要求：

- npm 包目录存在 `release-meta.json`
- 其中 `releaseTag=myte-vX.Y.Z`
- 安装脚本消费的是显式 `releaseTag`，而不是自己拼接版本

**Step 2: Run test to verify it fails**

Run: `cd myte && node scripts/test-build-npx-contract.mjs`
Expected: FAIL，因为当前实现尚未写入或读取 `release-meta.json`。

**Step 3: Keep implementation unchanged**

先确认失败原因正确。

### Task 8: 实现 myte 对统一元数据协议的适配

**Files:**
- Modify: `myte/npm/myte/scripts/install.js`
- Modify: `myte/npm/template/scripts/install.js`
- Modify: `myte/scripts/build-npx.mjs`
- Modify: `myte/scripts/test-build-npx-contract.mjs`
- Test: `myte/scripts/test-build-npx-contract.mjs`

**Step 1: Write one more failing test**

增加缺失元数据测试，要求提示“缺少 release-meta.json”而不是静默回退到旧逻辑。

**Step 2: Run test to verify it fails**

Run: `cd myte && node scripts/test-build-npx-contract.mjs`
Expected: FAIL

**Step 3: Write minimal implementation**

修改 `myte/scripts/build-npx.mjs`：

- 在构建 npm 包目录时生成标准 `release-meta.json`
- 正式发布路径写入 `distributionMode=github_release`

修改 `myte/npm/myte/scripts/install.js` 与模板脚本：

- 读取包内 `release-meta.json`
- 使用显式 `releaseTag`、`releaseRepository`、`releasePackageKey`
- 禁止回退到旧的隐式拼接逻辑

**Step 4: Run test to verify it passes**

Run: `cd myte && node scripts/test-build-npx-contract.mjs`
Expected: PASS

### Task 9: 更新文档与验证命令

**Files:**
- Modify: `deploy-center/README.md`
- Modify: `myte/docs/release.md`
- Modify: `vibe-kanban/npx-cli/README.md`
- Test: `deploy-center/tests/npm-release-workflow.sh`
- Test: `cd vibe-kanban/npx-cli && npm run check`
- Test: `cd myte && node scripts/test-build-npx-contract.mjs`

**Step 1: Write the doc deltas**

文档需要明确：

- 正式发布包与本地自包含包的区别
- `release-meta.json` 的字段与职责
- `pack:npx-local` 的使用方式

**Step 2: Run focused verification**

Run:

```bash
cd deploy-center && bash tests/npm-release-workflow.sh
cd ../vibe-kanban/npx-cli && npm run check
cd ../../myte && node scripts/test-build-npx-contract.mjs
```

Expected: PASS

**Step 3: Run broader verification**

Run:

```bash
cd deploy-center && bash tests/release-workflow.sh
cd ../vibe-kanban && pnpm run build:npx
cd ../myte && pnpm run build:npx
```

Expected: PASS
