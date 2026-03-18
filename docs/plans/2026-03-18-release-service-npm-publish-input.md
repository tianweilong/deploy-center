# npm 发布输入拆分 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 npm 发布流程拆分为“准备发布输入”“构建 GitHub Release 资产”“消费发布输入并发布 npm 包”三类单一职责脚本，并让 `release-npm` 不再重复构建源码。

**Architecture:** 在 `release-service.yml` 中保留现有三段式 job 边界，但新增一个稳定的 `npm-publish-input` artifact 作为 `release-npm` 的唯一输入。Shell 脚本按职责拆分，公共的版本解析与发布元数据生成逻辑集中复用，发布 job 只做校验、`npm pack` 和 `npm publish`。

**Tech Stack:** GitHub Actions YAML、Bash、Node.js、npm、shell tests

---

### Task 1: 先用测试锁定 workflow 新契约

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Modify: `tests/release-workflow.sh`
- Modify: `tests/npm-release-workflow.sh`
- Test: `tests/release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write the failing test**

在 `tests/release-workflow.sh` 增加断言：

- `release-npm` 会下载 `npm-publish-input` artifact；
- `release-npm` 不再直接运行 `./scripts/release-npm-package.sh source`；
- workflow 仍保留 `release-github-release` 在 `release-npm` 之前。

在 `tests/npm-release-workflow.sh` 增加断言：

- 新脚本名 `prepare-npm-publish-input.sh`、`build-npm-release-assets.sh`、`publish-npm-package.sh` 被引用；
- 旧混合脚本不再承担发布与构建双职责。

**Step 2: Run test to verify it fails**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: FAIL，因为 workflow 和脚本尚未拆分。

**Step 3: Write minimal implementation**

先只修改测试与最少量 workflow 占位，让失败信息精确指向缺失的脚本和 artifact 契约。

**Step 4: Run test to verify it passes**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: PASS，测试已锁定目标结构。

**Step 5: Commit**

```bash
git add .github/workflows/release-service.yml tests/release-workflow.sh tests/npm-release-workflow.sh
git commit -m "test: lock npm publish input workflow contract"
```

### Task 2: 提取公共 npm 发布上下文逻辑

**Files:**
- Create: `scripts/npm-release-common.sh`
- Modify: `scripts/release-npm-package.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write the failing test**

在 `tests/npm-release-workflow.sh` 中增加断言，要求公共逻辑文件存在并被新脚本 `source` 或间接复用，例如检查：

```bash
test -f scripts/npm-release-common.sh
grep -q 'npm-release-common.sh' scripts/prepare-npm-publish-input.sh
grep -q 'npm-release-common.sh' scripts/publish-npm-package.sh
```

**Step 2: Run test to verify it fails**

Run: `bash tests/npm-release-workflow.sh`
Expected: FAIL，因为公共脚本尚不存在。

**Step 3: Write minimal implementation**

创建 `scripts/npm-release-common.sh`，提取：

- 包名校验；
- 版本解析；
- `release_meta` payload 生成；
- release tag 推导。

旧脚本暂时可继续引用该公共脚本，作为迁移过渡。

**Step 4: Run test to verify it passes**

Run: `bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/npm-release-common.sh scripts/release-npm-package.sh tests/npm-release-workflow.sh
git commit -m "refactor: extract npm release common helpers"
```

### Task 3: 新增“准备 npm 发布输入”脚本

**Files:**
- Create: `scripts/prepare-npm-publish-input.sh`
- Modify: `tests/npm-release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write the failing test**

在 `tests/npm-release-workflow.sh` 中加入断言，要求新脚本：

- 生成 `package/`；
- 生成 `publish-context.json`；
- 生成 `manifest.txt`；
- 生成 `package/release-meta.json`。

**Step 2: Run test to verify it fails**

Run: `bash tests/npm-release-workflow.sh`
Expected: FAIL，因为脚本和输出约定尚不存在。

**Step 3: Write minimal implementation**

创建 `scripts/prepare-npm-publish-input.sh`：

- 复用公共版本解析；
- 执行 `pnpm i --frozen-lockfile` 与 `pnpm run build:npx`；
- 将待发布目录整理到标准输出目录；
- 写入 `publish-context.json`、`manifest.txt` 和 `release-meta.json`。

**Step 4: Run test to verify it passes**

Run: `bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/prepare-npm-publish-input.sh tests/npm-release-workflow.sh
git commit -m "feat: prepare npm publish input artifact"
```

### Task 4: 新增“构建 GitHub Release 资产”脚本

**Files:**
- Create: `scripts/build-npm-release-assets.sh`
- Modify: `tests/npm-release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write the failing test**

在 `tests/npm-release-workflow.sh` 中加入断言，要求新脚本仅处理：

- 平台目录映射；
- 压缩包生成；
- checksum 输出。

并断言它不包含 `npm publish`。

**Step 2: Run test to verify it fails**

Run: `bash tests/npm-release-workflow.sh`
Expected: FAIL，因为脚本尚不存在。

**Step 3: Write minimal implementation**

创建 `scripts/build-npm-release-assets.sh`，迁移旧脚本中：

- 平台目录映射；
- 合同校验；
- stage 目录准备；
- 压缩与 checksum 生成逻辑。

**Step 4: Run test to verify it passes**

Run: `bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/build-npm-release-assets.sh tests/npm-release-workflow.sh
git commit -m "feat: split npm release asset build script"
```

### Task 5: 新增“发布 npm 包”脚本

**Files:**
- Create: `scripts/publish-npm-package.sh`
- Modify: `tests/npm-release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write the failing test**

在 `tests/npm-release-workflow.sh` 中加入断言，要求发布脚本：

- 校验 `publish-context.json`；
- 校验 `manifest.txt`；
- 在发布输入目录内执行 `npm pack`；
- 执行 `npm publish`；
- 不包含 `pnpm i` 或 `pnpm run build:npx`。

**Step 2: Run test to verify it fails**

Run: `bash tests/npm-release-workflow.sh`
Expected: FAIL，因为脚本尚不存在。

**Step 3: Write minimal implementation**

创建 `scripts/publish-npm-package.sh`，只消费下载后的发布输入目录，执行校验、`npm version`、`npm pack`、`npm publish`，保留“版本已存在则跳过”的幂等行为。

**Step 4: Run test to verify it passes**

Run: `bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/publish-npm-package.sh tests/npm-release-workflow.sh
git commit -m "feat: publish npm package from prepared input"
```

### Task 6: 调整 workflow 消费新脚本与 artifact

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Test: `tests/release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write the failing test**

补充断言：

- `release-npm-assets` 或独立准备步骤会上传 `npm-publish-input`；
- `release-npm` 会下载 `npm-publish-input`；
- `release-npm-assets` 使用 `build-npm-release-assets.sh`；
- `release-npm` 使用 `publish-npm-package.sh`。

**Step 2: Run test to verify it fails**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: FAIL，因为 workflow 尚未切换。

**Step 3: Write minimal implementation**

修改 `.github/workflows/release-service.yml`：

- 接入 `prepare-npm-publish-input.sh`；
- 上传 `npm-publish-input` artifact；
- 切换平台资产步骤到 `build-npm-release-assets.sh`；
- 在 `release-npm` 下载 artifact 后调用 `publish-npm-package.sh`。

**Step 4: Run test to verify it passes**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 5: Commit**

```bash
git add .github/workflows/release-service.yml tests/release-workflow.sh tests/npm-release-workflow.sh
git commit -m "feat: publish npm from prepared artifact"
```

### Task 7: 删除旧混合脚本或收敛为兼容入口

**Files:**
- Modify: `scripts/release-npm-package.sh`
- Modify: `tests/npm-release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write the failing test**

在 `tests/npm-release-workflow.sh` 中增加断言，要求旧脚本要么：

- 被删除；要么
- 明确输出已废弃并转调新脚本，而不是继续保留完整实现。

**Step 2: Run test to verify it fails**

Run: `bash tests/npm-release-workflow.sh`
Expected: FAIL，因为旧脚本仍是完整混合逻辑。

**Step 3: Write minimal implementation**

根据兼容性需要选择：

- 如果仓库内无其他引用，删除旧脚本；
- 如果需要过渡兼容，则将其改为显式报错或转调新脚本入口。

**Step 4: Run test to verify it passes**

Run: `bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/release-npm-package.sh tests/npm-release-workflow.sh
git commit -m "refactor: retire mixed npm release script"
```

### Task 8: 运行最终验证

**Files:**
- Modify: `docs/plans/2026-03-18-release-service-npm-publish-input.md`

**Step 1: Run focused workflow tests**

Run: `bash tests/release-workflow.sh`
Expected: PASS

**Step 2: Run npm release workflow tests**

Run: `bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 3: Run shell syntax checks**

Run: `bash -n scripts/npm-release-common.sh scripts/prepare-npm-publish-input.sh scripts/build-npm-release-assets.sh scripts/publish-npm-package.sh`
Expected: PASS

**Step 4: Update plan notes**

在本计划文档末尾追加实际实现偏差、遗留风险和后续待办。

**Step 5: Commit**

```bash
git add docs/plans/2026-03-18-release-service-npm-publish-input.md
git commit -m "docs: finalize npm publish input implementation notes"
```
