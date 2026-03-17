# vibe-kanban npm 改为 GitHub Release 平台分发 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `vibe-kanban` 的 npm 发布从“包内携带 dist 平台产物”改为“GitHub Release 托管多平台资产 + npm 轻量壳包运行时按平台下载”，并新增 `linux-arm64` 支持。

**Architecture:** `deploy-center` 保留 `release-npm-assets`、`release-github-release`、`release-npm` 三段式流程，先构建四个平台资产上传到 GitHub Release，再发布不包含 `dist` 的 npm 包。`vibe-kanban/npx-cli` 继续沿用现有平台探测、下载、校验、缓存、解压逻辑，但把下载源从 R2 切到 GitHub Release，并把平台支持列表收敛到真实发布的平台集合。

**Tech Stack:** GitHub Actions YAML、Bash、Node.js、TypeScript、npm、GitHub Release、shell tests

---

### Task 1: 用测试锁定“npm 包不再携带 dist”

**Files:**
- Modify: `vibe-kanban/package.json`
- Modify: `vibe-kanban/npx-cli/package.json`
- Create: `vibe-kanban/scripts/test-npm-package-contents.mjs`
- Test: `vibe-kanban/scripts/test-npm-package-contents.mjs`

**Step 1: Write the failing test**

创建 `vibe-kanban/scripts/test-npm-package-contents.mjs`，断言根包与 `npx-cli` 的 `files` 配置不再包含 `dist`：

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const cliPkg = JSON.parse(fs.readFileSync('npx-cli/package.json', 'utf8'));

assert.equal(
  rootPkg.files.some((entry) => entry.includes('dist')),
  false,
  '根 npm 包不应继续打包 npx-cli/dist'
);
assert.equal(
  cliPkg.files.some((entry) => entry.includes('dist')),
  false,
  'npx-cli 包不应继续打包 dist'
);
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-npm-package-contents.mjs`
Expected: FAIL，并提示当前 `package.json` / `npx-cli/package.json` 仍包含 `dist`。

**Step 3: Write minimal implementation**

修改：

- `vibe-kanban/package.json`
- `vibe-kanban/npx-cli/package.json`

删除 `dist` 相关 `files` 项，仅保留 CLI 运行所需文件。

**Step 4: Run test to verify it passes**

Run: `node scripts/test-npm-package-contents.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add vibe-kanban/package.json vibe-kanban/npx-cli/package.json vibe-kanban/scripts/test-npm-package-contents.mjs
git commit -m "test: lock npm package contents"
```

### Task 2: 用测试锁定 GitHub Release 下载协议

**Files:**
- Create: `vibe-kanban/npx-cli/src/download.test.ts`
- Modify: `vibe-kanban/npx-cli/src/download.ts`
- Test: `vibe-kanban/npx-cli/src/download.test.ts`

**Step 1: Write the failing test**

在 `vibe-kanban/npx-cli/src/download.test.ts` 中写最小测试，覆盖：

- `linux-x64`、`linux-arm64`、`win32-x64`、`darwin-arm64` 的资产名推导；
- checksum 文件名推导；
- GitHub Release 下载 URL 推导。

最小测试示例：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getReleaseAssetName,
  getChecksumsAssetName,
  getReleaseAssetUrl,
} from './download';

test('linux-arm64 maps to a dedicated GitHub Release asset', () => {
  assert.equal(
    getReleaseAssetName('linux-arm64', 'tar.gz'),
    'vibe-kanban-v1.2.3-linux-arm64.tar.gz'
  );
});
```

**Step 2: Run test to verify it fails**

Run: `cd vibe-kanban/npx-cli && node --test src/download.test.ts`
Expected: FAIL，因为相关 helper 尚不存在，且当前逻辑仍依赖 R2。

**Step 3: Write minimal implementation**

在 `vibe-kanban/npx-cli/src/download.ts` 中提取 helper：

- `getChecksumsAssetName`
- `getReleaseAssetName`
- `getReleaseAssetUrl`
- `parseChecksumsFile`

并将下载源改为 GitHub Release。

**Step 4: Run test to verify it passes**

Run: `cd vibe-kanban/npx-cli && node --test src/download.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add vibe-kanban/npx-cli/src/download.ts vibe-kanban/npx-cli/src/download.test.ts
git commit -m "test: lock github release download contract"
```

### Task 3: 先用测试锁定真实支持平台列表

**Files:**
- Create: `vibe-kanban/npx-cli/src/cli-platform.test.ts`
- Modify: `vibe-kanban/npx-cli/src/cli.ts`
- Test: `vibe-kanban/npx-cli/src/cli-platform.test.ts`

**Step 1: Write the failing test**

新增平台映射测试，断言：

- 支持 `linux-x64`
- 支持 `linux-arm64`
- 支持 `win32-x64`
- 支持 `darwin-arm64`
- 不再宣称支持 `windows-arm64`
- 不再宣称支持 `macos-x64`

示例：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { mapPlatform } from './cli';

test('linux arm64 resolves to linux-arm64', () => {
  assert.equal(mapPlatform('linux', 'arm64'), 'linux-arm64');
});
```

**Step 2: Run test to verify it fails**

Run: `cd vibe-kanban/npx-cli && node --test src/cli-platform.test.ts`
Expected: FAIL，因为平台映射 helper 尚未暴露，且当前支持列表与真实发布平台不一致。

**Step 3: Write minimal implementation**

在 `vibe-kanban/npx-cli/src/cli.ts` 中提取纯函数平台映射 helper，并收敛支持平台集合到四个平台。

**Step 4: Run test to verify it passes**

Run: `cd vibe-kanban/npx-cli && node --test src/cli-platform.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add vibe-kanban/npx-cli/src/cli.ts vibe-kanban/npx-cli/src/cli-platform.test.ts
git commit -m "test: lock supported npm platforms"
```

### Task 4: 先用测试锁定 release workflow 的四平台资产发布

**Files:**
- Modify: `deploy-center/tests/release-workflow.sh`
- Modify: `deploy-center/tests/npm-release-workflow.sh`
- Modify: `deploy-center/.github/workflows/release-service.yml`
- Test: `deploy-center/tests/release-workflow.sh`
- Test: `deploy-center/tests/npm-release-workflow.sh`

**Step 1: Write the failing test**

在 `deploy-center/tests/release-workflow.sh` 中新增断言：

```bash
grep -q 'linux-arm64' "$file"
grep -q 'release-github-release' "$file"
grep -q '创建 GitHub Release' "$file"
grep -q '上传 GitHub Release 资产' "$file"
```

在 `deploy-center/tests/npm-release-workflow.sh` 中新增断言：

```bash
grep -q 'BUILD_ONLY' "$script"
grep -q 'checksums.txt' "$script"
grep -q 'npm publish' "$script"
```

**Step 2: Run test to verify it fails**

Run: `cd deploy-center && bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: FAIL，至少因为 workflow 矩阵缺少 `linux-arm64`。

**Step 3: Write minimal implementation**

修改 `deploy-center/.github/workflows/release-service.yml`：

- npm 矩阵加入 `linux-arm64`；
- 保持 `release-github-release` 在 `release-npm` 之前；
- 确保 checksum 上传逻辑仍保留。

必要时同步更新测试脚本以匹配新的断言。

**Step 4: Run test to verify it passes**

Run: `cd deploy-center && bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 5: Commit**

```bash
git add deploy-center/.github/workflows/release-service.yml deploy-center/tests/release-workflow.sh deploy-center/tests/npm-release-workflow.sh
git commit -m "test: lock release workflow platform matrix"
```

### Task 5: 把 npm 发布脚本收敛为“轻量 npm 包 + GitHub Release 资产”

**Files:**
- Modify: `deploy-center/scripts/release-npm-package.sh`
- Test: `deploy-center/tests/npm-release-workflow.sh`

**Step 1: Write the failing test**

先在 `deploy-center/tests/npm-release-workflow.sh` 加断言，要求脚本不会在发布轻量 npm 包前把平台 `package` 内容重新拷回源包，例如：

```bash
if grep -q "cp -R .*package_dir" "$script"; then
  echo "不应再把平台 package 内容合并回轻量 npm 包" >&2
  exit 1
fi
```

**Step 2: Run test to verify it fails**

Run: `cd deploy-center && bash tests/npm-release-workflow.sh`
Expected: FAIL，因为脚本当前仍可能合并产物目录。

**Step 3: Write minimal implementation**

调整 `deploy-center/scripts/release-npm-package.sh`：

- `BUILD_ONLY=true` 时仅构建并输出平台资产；
- 普通发布时只对轻量 npm 包执行 `npm version`、`npm pack`、`npm publish`；
- 不再依赖把平台 `package` 目录合并回 `NPM_PACKAGE_DIR`；
- 如需注入 GitHub Release 仓库/tag 信息，在这个阶段完成模板替换。

**Step 4: Run test to verify it passes**

Run: `cd deploy-center && bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 5: Commit**

```bash
git add deploy-center/scripts/release-npm-package.sh deploy-center/tests/npm-release-workflow.sh
git commit -m "feat: publish lightweight npm package"
```

### Task 6: 更新文档并补完整验证

**Files:**
- Modify: `deploy-center/docs/developer-guide.md`
- Modify: `deploy-center/docs/plans/2026-03-17-vibe-kanban-npm-github-release-design.md`
- Modify: `deploy-center/docs/plans/2026-03-17-vibe-kanban-npm-github-release.md`
- Test: `deploy-center/docs/developer-guide.md`

**Step 1: Write the failing doc check**

Run:

```bash
cd deploy-center && rg -n "linux-arm64|GitHub Release|轻量 npm 包|dist" docs/developer-guide.md
```

Expected: 输出中仍缺少新分发语义，或仍保留旧的“dist 打包进 npm”描述。

**Step 2: Write minimal implementation**

更新 `deploy-center/docs/developer-guide.md`，明确：

- 四平台资产矩阵；
- GitHub Release 上传顺序；
- npm 轻量包分发；
- `vibe-kanban` 运行时按平台下载。

**Step 3: Run final verification**

Run:

```bash
node vibe-kanban/scripts/test-npm-package-contents.mjs && \
cd vibe-kanban/npx-cli && node --test src/download.test.ts src/cli-platform.test.ts && \
cd ../../deploy-center && bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh
```

Expected: PASS

**Step 4: Inspect focused diff**

Run:

```bash
git diff -- \
  deploy-center/.github/workflows/release-service.yml \
  deploy-center/scripts/release-npm-package.sh \
  deploy-center/tests/release-workflow.sh \
  deploy-center/tests/npm-release-workflow.sh \
  deploy-center/docs/developer-guide.md \
  deploy-center/docs/plans/2026-03-17-vibe-kanban-npm-github-release-design.md \
  deploy-center/docs/plans/2026-03-17-vibe-kanban-npm-github-release.md \
  vibe-kanban/package.json \
  vibe-kanban/npx-cli/package.json \
  vibe-kanban/npx-cli/src/cli.ts \
  vibe-kanban/npx-cli/src/download.ts \
  vibe-kanban/npx-cli/src/download.test.ts \
  vibe-kanban/npx-cli/src/cli-platform.test.ts \
  vibe-kanban/scripts/test-npm-package-contents.mjs
```

Expected: 只包含本次 GitHub Release 平台分发相关改动。

**Step 5: Commit**

```bash
git add deploy-center/docs/developer-guide.md deploy-center/docs/plans/2026-03-17-vibe-kanban-npm-github-release-design.md deploy-center/docs/plans/2026-03-17-vibe-kanban-npm-github-release.md
git commit -m "docs: describe github release npm distribution"
```
