# npm 构建规范统一 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `deploy-center`、`myte`、`vibe-kanban` 围绕同一份 npm 平台构建契约工作，统一 `build:npx` 输入、`dist/<platform>` 目录结构、`manifest.json` 元数据和契约校验流程，从根本上消除“修一个坏一个”的发布回归。

**Architecture:** `deploy-center` 定义并校验唯一的标准产物契约，只消费 `${NPM_PACKAGE_DIR}/dist/<platform>/manifest.json` 与 `files` 列出的文件。`myte` 将现有 `vendor/<target>` 布局迁移到标准 `dist/<platform>`，并同步更新安装逻辑。`vibe-kanban` 保持现有 `dist/<platform>` 主结构，但补齐统一 manifest 和契约测试。整个改动按 TDD 推进，先写失败测试，再做最小实现。

**Tech Stack:** GitHub Actions YAML、Bash、Node.js、pnpm、Go、TypeScript、shell tests、Node integration tests

---

### Task 1: 为 deploy-center 锁定标准契约校验输入

**Files:**
- Create: `deploy-center/tests/fixtures/npm-contract/valid/linux-x64/manifest.json`
- Create: `deploy-center/tests/fixtures/npm-contract/valid/linux-x64/myte`
- Create: `deploy-center/tests/fixtures/npm-contract/missing-file/linux-x64/manifest.json`
- Create: `deploy-center/tests/test-npm-build-contract.mjs`
- Test: `deploy-center/tests/test-npm-build-contract.mjs`

**Step 1: Write the failing test**

创建 `deploy-center/tests/test-npm-build-contract.mjs`，覆盖两类最小场景：

- `valid/linux-x64`：`manifest.json` 完整，`files` 中声明的文件存在，应通过校验
- `missing-file/linux-x64`：`manifest.json` 声明了不存在的文件，应失败

测试骨架：

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBuildContract } from '../scripts/validate-npm-build-contract.mjs';

test('valid contract passes', async () => {
  const result = await validateBuildContract('tests/fixtures/npm-contract/valid/linux-x64');
  assert.deepEqual(result.files, ['myte']);
});

test('missing file contract fails', async () => {
  await assert.rejects(
    () => validateBuildContract('tests/fixtures/npm-contract/missing-file/linux-x64'),
    /声明文件不存在/
  );
});
```

**Step 2: Run test to verify it fails**

Run: `cd deploy-center && node --test tests/test-npm-build-contract.mjs`
Expected: FAIL，因为 `scripts/validate-npm-build-contract.mjs` 尚不存在。

**Step 3: Write minimal implementation**

先只创建测试夹具文件：

- `tests/fixtures/npm-contract/valid/linux-x64/manifest.json`
- `tests/fixtures/npm-contract/valid/linux-x64/myte`
- `tests/fixtures/npm-contract/missing-file/linux-x64/manifest.json`

暂不写生产实现，保持测试继续失败，确认失败原因是缺少校验脚本。

**Step 4: Run test to verify it still fails for the right reason**

Run: `cd deploy-center && node --test tests/test-npm-build-contract.mjs`
Expected: FAIL，错误指向无法导入 `validateBuildContract`。

**Step 5: Commit**

```bash
git add deploy-center/tests/fixtures/npm-contract deploy-center/tests/test-npm-build-contract.mjs
git commit -m "test: add npm build contract fixtures"
```

### Task 2: 实现 deploy-center 的通用契约校验脚本

**Files:**
- Create: `deploy-center/scripts/validate-npm-build-contract.mjs`
- Modify: `deploy-center/tests/test-npm-build-contract.mjs`
- Test: `deploy-center/tests/test-npm-build-contract.mjs`

**Step 1: Write the failing test**

在 `deploy-center/tests/test-npm-build-contract.mjs` 中再补一条失败用例，锁定字段一致性：

```js
test('platform mismatch fails', async () => {
  await assert.rejects(
    () => validateBuildContract('tests/fixtures/npm-contract/platform-mismatch/linux-x64'),
    /platform 字段与目录名不一致/
  );
});
```

并补对应 fixture 的 `manifest.json`。

**Step 2: Run test to verify it fails**

Run: `cd deploy-center && node --test tests/test-npm-build-contract.mjs`
Expected: FAIL，因为校验脚本尚未实现。

**Step 3: Write minimal implementation**

创建 `deploy-center/scripts/validate-npm-build-contract.mjs`，导出：

```js
export async function validateBuildContract(platformDir) {}
```

最小实现需要：

- 读取并解析 `manifest.json`
- 校验 `schemaVersion`、`platform`、`targetOs`、`targetArch`、`files`
- 校验 `files` 为非空数组
- 校验每个声明文件都存在
- 返回解析后的 manifest 与绝对文件路径

CLI 模式支持：

```bash
node scripts/validate-npm-build-contract.mjs path/to/dist/linux-x64
```

失败时输出中文错误并以非零退出。

**Step 4: Run test to verify it passes**

Run: `cd deploy-center && node --test tests/test-npm-build-contract.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add deploy-center/scripts/validate-npm-build-contract.mjs deploy-center/tests/test-npm-build-contract.mjs deploy-center/tests/fixtures/npm-contract
git commit -m "feat: add npm build contract validator"
```

### Task 3: 让 release-npm-package.sh 只消费标准契约

**Files:**
- Modify: `deploy-center/scripts/release-npm-package.sh`
- Modify: `deploy-center/tests/npm-release-workflow.sh`
- Test: `deploy-center/tests/npm-release-workflow.sh`
- Test: `deploy-center/tests/test-npm-build-contract.mjs`

**Step 1: Write the failing test**

在 `deploy-center/tests/npm-release-workflow.sh` 增加断言，要求脚本：

- 调用 `validate-npm-build-contract.mjs`
- 不再只用 `[ -d "${source_dist_dir}" ]` 判断成功
- 打包时基于 manifest 声明文件，而不是盲目 `tar -C source_dir .`

最小断言示例：

```bash
grep -q 'validate-npm-build-contract.mjs' "$script"
grep -q 'manifest.json' "$script"
grep -q 'manifest_files' "$script"
```

**Step 2: Run test to verify it fails**

Run: `cd deploy-center && bash tests/npm-release-workflow.sh`
Expected: FAIL，因为脚本当前仍只检查目录存在。

**Step 3: Write minimal implementation**

修改 `deploy-center/scripts/release-npm-package.sh`：

- 在 `BUILD_ONLY=true` 分支中先调用：

```bash
node ./scripts/validate-npm-build-contract.mjs "${source_dist_dir}"
```

- 让校验脚本输出一个 JSON 结果，shell 侧解析出 `files`
- 构建临时 staging 目录，仅复制 `manifest.files` 中声明的文件和 `manifest.json`
- 归档 staging 目录，而不是直接归档整个 `source_dist_dir`

必要时同步更新 `create_platform_archive` 的调用方式。

**Step 4: Run test to verify it passes**

Run: `cd deploy-center && bash tests/npm-release-workflow.sh && node --test tests/test-npm-build-contract.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add deploy-center/scripts/release-npm-package.sh deploy-center/tests/npm-release-workflow.sh deploy-center/tests/test-npm-build-contract.mjs
git commit -m "feat: consume npm build contract in release script"
```

### Task 4: 用失败测试锁定 myte 的标准目录结构

**Files:**
- Create: `myte/scripts/test-build-npx-contract.mjs`
- Modify: `myte/package.json`
- Test: `myte/scripts/test-build-npx-contract.mjs`

**Step 1: Write the failing test**

创建 `myte/scripts/test-build-npx-contract.mjs`，执行一次最小构建并断言：

- `npm/myte/dist/linux-x64/manifest.json` 存在
- `manifest.platform === 'linux-x64'`
- `manifest.files` 非空
- `manifest.files` 中声明文件都在 `npm/myte/dist/linux-x64/` 下存在

测试骨架：

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

spawnSync('pnpm', ['run', 'build:npx'], {
  env: { ...process.env, TARGET_OS: 'linux', TARGET_ARCH: 'x64', SOURCE_TAG: 'v0.1.2' },
  stdio: 'inherit',
});

const manifest = JSON.parse(fs.readFileSync('npm/myte/dist/linux-x64/manifest.json', 'utf8'));
assert.equal(manifest.platform, 'linux-x64');
assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
```

**Step 2: Run test to verify it fails**

Run: `cd myte && node scripts/test-build-npx-contract.mjs`
Expected: FAIL，因为当前只会输出 `npm/myte/vendor/linux-x64`。

**Step 3: Write minimal implementation**

在 `myte/package.json` 中加入测试脚本：

```json
"test:build:npx-contract": "node ./scripts/test-build-npx-contract.mjs"
```

暂不修改生产构建脚本，保持失败，以确认测试真的锁定了新契约。

**Step 4: Run test to verify it still fails for the right reason**

Run: `cd myte && node scripts/test-build-npx-contract.mjs`
Expected: FAIL，错误明确指向 `npm/myte/dist/linux-x64/manifest.json` 缺失。

**Step 5: Commit**

```bash
git add myte/package.json myte/scripts/test-build-npx-contract.mjs
git commit -m "test: lock myte npm build contract"
```

### Task 5: 将 myte 的 build:npx 迁移到 dist/<platform>

**Files:**
- Modify: `myte/scripts/build-npx.mjs`
- Modify: `myte/npm/myte/scripts/install.js`
- Test: `myte/scripts/test-build-npx-contract.mjs`

**Step 1: Write the failing test**

在 `myte/scripts/test-build-npx-contract.mjs` 中增加对运行时消费路径的断言，锁定安装逻辑不再依赖旧布局：

```js
const installScript = fs.readFileSync('npm/myte/scripts/install.js', 'utf8');
assert.equal(installScript.includes('vendor/'), false, '安装脚本不应继续依赖 vendor 布局');
```

**Step 2: Run test to verify it fails**

Run: `cd myte && node scripts/test-build-npx-contract.mjs`
Expected: FAIL，因为 `install.js` 仍依赖 `vendor`。

**Step 3: Write minimal implementation**

修改 `myte/scripts/build-npx.mjs`：

- 统一平台映射为标准名 `linux-x64` / `windows-x64` / `macos-arm64`
- 将平台二进制输出到 `npm/myte/dist/<platform>/`
- 生成 `manifest.json`，`files` 至少包含二进制文件名
- 清理旧的 `vendor` 生成逻辑

修改 `myte/npm/myte/scripts/install.js`：

- 运行时从标准布局读取对应平台文件
- 若必须保留 vendor 概念，也只允许作为安装阶段临时路径，不再作为构建产物契约

**Step 4: Run test to verify it passes**

Run: `cd myte && node scripts/test-build-npx-contract.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add myte/scripts/build-npx.mjs myte/npm/myte/scripts/install.js myte/scripts/test-build-npx-contract.mjs
git commit -m "feat: standardize myte npm build output"
```

### Task 6: 用失败测试锁定 vibe-kanban 的 manifest 契约

**Files:**
- Create: `vibe-kanban/scripts/test-build-npx-contract.mjs`
- Modify: `vibe-kanban/package.json`
- Test: `vibe-kanban/scripts/test-build-npx-contract.mjs`

**Step 1: Write the failing test**

创建 `vibe-kanban/scripts/test-build-npx-contract.mjs`，执行一次 `linux-x64` 构建并断言：

- `npx-cli/dist/linux-x64/manifest.json` 存在
- `manifest.platform === 'linux-x64'`
- `manifest.files` 非空
- `manifest.files` 中每个文件都存在

**Step 2: Run test to verify it fails**

Run: `cd vibe-kanban && node scripts/test-build-npx-contract.mjs`
Expected: FAIL，因为当前 `npx-cli/dist/linux-x64` 没有标准 `manifest.json`。

**Step 3: Write minimal implementation**

在 `vibe-kanban/package.json` 中加入：

```json
"test:build:npx-contract": "node ./scripts/test-build-npx-contract.mjs"
```

保留测试失败，确认锁定点正确。

**Step 4: Run test to verify it still fails for the right reason**

Run: `cd vibe-kanban && node scripts/test-build-npx-contract.mjs`
Expected: FAIL，错误明确指向缺少 `manifest.json`。

**Step 5: Commit**

```bash
git add vibe-kanban/package.json vibe-kanban/scripts/test-build-npx-contract.mjs
git commit -m "test: lock vibe-kanban npm build contract"
```

### Task 7: 为 vibe-kanban 生成标准 manifest

**Files:**
- Modify: `vibe-kanban/local-build.sh`
- Modify: `vibe-kanban/scripts/test-build-npx-contract.mjs`
- Test: `vibe-kanban/scripts/test-build-npx-contract.mjs`

**Step 1: Write the failing test**

在 `vibe-kanban/scripts/test-build-npx-contract.mjs` 中再增加断言，明确 `files` 需要列出三个 zip：

```js
assert.deepEqual(manifest.files.sort(), [
  'vibe-kanban-mcp.zip',
  'vibe-kanban-review.zip',
  'vibe-kanban.zip',
]);
```

**Step 2: Run test to verify it fails**

Run: `cd vibe-kanban && node scripts/test-build-npx-contract.mjs`
Expected: FAIL，因为当前既没有 manifest，也没有稳定声明文件列表。

**Step 3: Write minimal implementation**

修改 `vibe-kanban/local-build.sh`：

- 在每个平台产物生成完成后写入 `npx-cli/dist/<platform>/manifest.json`
- manifest 中填入：
  - `schemaVersion: 1`
  - `packageName: @vino.tian/vibe-kanban`
  - `packageVersion`
  - `platform`
  - `targetOs`
  - `targetArch`
  - `generatedAt`
  - `files: ['vibe-kanban.zip', 'vibe-kanban-mcp.zip', 'vibe-kanban-review.zip']`

**Step 4: Run test to verify it passes**

Run: `cd vibe-kanban && node scripts/test-build-npx-contract.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add vibe-kanban/local-build.sh vibe-kanban/scripts/test-build-npx-contract.mjs
git commit -m "feat: add vibe-kanban npm build manifest"
```

### Task 8: 把 deploy-center 的 workflow 回归测试收敛到统一契约

**Files:**
- Modify: `deploy-center/tests/release-workflow.sh`
- Modify: `deploy-center/.github/workflows/release-service.yml`
- Test: `deploy-center/tests/release-workflow.sh`
- Test: `deploy-center/tests/npm-release-workflow.sh`

**Step 1: Write the failing test**

在 `deploy-center/tests/release-workflow.sh` 中增加断言，要求 workflow 明确保留四个平台 npm 矩阵，并使用统一校验脚本：

```bash
grep -q '"target":"linux-x64"' "$file"
grep -q '"target":"linux-arm64"' "$file"
grep -q '"target":"win32-x64"' "$file"
grep -q '"target":"darwin-arm64"' "$file"
grep -q 'validate-npm-build-contract.mjs' "$file" || true
```

如果 workflow 需要新增显式校验步骤，则在这里锁定。

**Step 2: Run test to verify it fails**

Run: `cd deploy-center && bash tests/release-workflow.sh`
Expected: FAIL，直到 workflow 与新的契约校验调用对齐。

**Step 3: Write minimal implementation**

按需要更新：

- `deploy-center/.github/workflows/release-service.yml`
- `deploy-center/tests/release-workflow.sh`

确保 npm 构建矩阵、脚本调用方式和测试断言一致。

**Step 4: Run test to verify it passes**

Run: `cd deploy-center && bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 5: Commit**

```bash
git add deploy-center/.github/workflows/release-service.yml deploy-center/tests/release-workflow.sh deploy-center/tests/npm-release-workflow.sh
git commit -m "test: align release workflow with npm build contract"
```

### Task 9: 做跨仓库最小回归验证

**Files:**
- No code changes required unless verification reveals gaps
- Test: `deploy-center/tests/test-npm-build-contract.mjs`
- Test: `myte/scripts/test-build-npx-contract.mjs`
- Test: `vibe-kanban/scripts/test-build-npx-contract.mjs`

**Step 1: Run focused verification**

Run:

```bash
cd deploy-center && node --test tests/test-npm-build-contract.mjs && bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh
cd myte && node scripts/test-build-npx-contract.mjs
cd vibe-kanban && node scripts/test-build-npx-contract.mjs
```

Expected: 全部 PASS

**Step 2: Run repository-required checks**

Run:

```bash
cd myte && make test && make lint
cd vibe-kanban && pnpm run format && pnpm run check && pnpm run lint
```

Expected: PASS

**Step 3: Fix any failures with TDD**

若出现失败：

- 先在对应仓库补最小失败测试
- 再写最小修复
- 重跑该仓库验证

**Step 4: Record verification output**

把关键验证命令与结果整理进 PR/变更说明，避免只声称“已修复”而没有证据。

**Step 5: Commit**

```bash
git add -A
git commit -m "test: verify npm build contract across repositories"
```
