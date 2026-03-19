# tests 统一为 Node.js ESM Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `tests/` 目录中的 shell 测试全部迁移为 Node.js ESM 测试，并移除残留 Ruby 依赖。

**Architecture:** 保持每个测试文件的职责边界不变，将 shell 的文本断言、临时目录和命令调用迁移为 Node 标准库实现。优先做一比一迁移，不重构测试意图。

**Tech Stack:** Node.js ESM、`node:test`、`node:assert/strict`、`node:fs/promises`、`node:child_process`

---

### Task 1: 锁定 shell 测试应被替换的失败检查

**Files:**
- Modify: `docs/developer-guide.md`
- Modify: `tests/npm-release-workflow.mjs` 或未来对应文件

**Step 1: 写失败检查**

新增或更新测试约束，明确：

- `tests/` 下不再保留 `.sh`
- 不再允许 `ruby -rjson -e`

**Step 2: 运行验证确认失败**

Run: `rg --files tests -g '*.sh' && rg -n "ruby -rjson -e" tests`

Expected: FAIL，因为当前仍存在 `.sh` 与 Ruby 断言。

### Task 2: 迁移 matrix 相关测试到 Node

**Files:**
- Create: `tests/prepare-release-matrix.mjs`
- Create: `tests/prepare-release-matrix-new-api.mjs`
- Delete: `tests/prepare-release-matrix.sh`
- Delete: `tests/prepare-release-matrix-new-api.sh`

**Step 1: 写最小 Node 版本测试**

将 shell 调用与 Ruby JSON 断言迁移为：

- `execFileSync('node', ['scripts/prepare-release-matrix.mjs', ...])`
- `JSON.parse`
- `assert.equal` / `assert.deepEqual`

**Step 2: 运行测试确认通过**

Run: `node tests/prepare-release-matrix.mjs && node tests/prepare-release-matrix-new-api.mjs`

Expected: PASS

### Task 3: 迁移轻量仓库约束测试到 Node

**Files:**
- Create: `tests/ghcr-references.mjs`
- Create: `tests/localization-language.mjs`
- Delete: `tests/ghcr-references.sh`
- Delete: `tests/localization-language.sh`

**Step 1: 一比一迁移断言**

把 grep 类断言迁为：

- 读取文件内容
- `assert.match`
- `assert.doesNotMatch`

**Step 2: 运行测试确认通过**

Run: `node tests/ghcr-references.mjs && node tests/localization-language.mjs`

Expected: PASS

### Task 4: 迁移 checksum 与 zip 校验测试到 Node

**Files:**
- Create: `tests/merge-release-checksums.mjs`
- Create: `tests/npm-release-zip-validation.mjs`
- Delete: `tests/merge-release-checksums.sh`
- Delete: `tests/npm-release-zip-validation.sh`

**Step 1: 写 Node 版临时目录测试**

使用：

- `mkdtemp`
- `writeFile`
- `execFileSync('node', [...])`

保持原有行为断言不变。

**Step 2: 运行测试确认通过**

Run: `node tests/merge-release-checksums.mjs && node tests/npm-release-zip-validation.mjs`

Expected: PASS

### Task 5: 迁移产物目录与 workflow 结构测试到 Node

**Files:**
- Create: `tests/release-npm-package-artifact-path.mjs`
- Create: `tests/release-workflow.mjs`
- Create: `tests/npm-release-workflow.mjs`
- Delete: `tests/release-npm-package-artifact-path.sh`
- Delete: `tests/release-workflow.sh`
- Delete: `tests/npm-release-workflow.sh`

**Step 1: 迁移命令编排与文本断言**

用 Node 实现：

- 临时工作区创建
- fixture 拷贝
- `node scripts/*.mjs` 调用
- workflow 文本结构断言

**Step 2: 运行测试确认通过**

Run: `node tests/release-npm-package-artifact-path.mjs && node tests/release-workflow.mjs && node tests/npm-release-workflow.mjs`

Expected: PASS

### Task 6: 删除遗留 shell 测试并更新文档

**Files:**
- Modify: `docs/developer-guide.md`
- Delete: `tests/*.sh`（按实际迁移结果）

**Step 1: 更新测试运行说明**

将开发者指南中的测试示例从 `bash tests/*.sh` 改为 `node tests/*.mjs`。

**Step 2: 删除剩余 shell 测试**

确保 `tests/` 下不再保留 `.sh`。

### Task 7: 全量验证

**Files:**
- Test: `tests/*.mjs`

**Step 1: 运行 Node 单测**

Run: `node --test tests/test-npm-release-common.mjs tests/test-release-meta.mjs tests/test-npm-build-contract.mjs`

Expected: PASS

**Step 2: 运行迁移后的脚本型测试**

Run: `node tests/prepare-release-matrix.mjs && node tests/prepare-release-matrix-new-api.mjs && node tests/ghcr-references.mjs && node tests/localization-language.mjs && node tests/merge-release-checksums.mjs && node tests/npm-release-zip-validation.mjs && node tests/release-npm-package-artifact-path.mjs && node tests/release-workflow.mjs && node tests/npm-release-workflow.mjs`

Expected: PASS

**Step 3: 检查残留**

Run: `rg --files tests -g '*.sh' && rg -n "ruby -rjson -e" tests`

Expected: 无输出。
