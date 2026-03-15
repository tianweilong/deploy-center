# release-service npm GitHub Release 分发约定化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `release-service` 当前的 GitHub Release 分发实现从“显式传入 release 仓库和 package-key”收敛为“固定当前仓库 + 由 `NPM_PACKAGE_NAME` 推导 package-key”的约定化方案。

**Architecture:** workflow 保留 `release-npm-assets`、`release-github-release`、`release-npm` 三阶段结构，但删除 `npm_release_package_key` 与 `npm_release_repository` 两个输入。脚本层面从 `NPM_PACKAGE_NAME` 自动推导 package-key，并统一用于生成 release tag、平台资产文件名和 checksums 文件名。

**Tech Stack:** GitHub Actions YAML、Bash、GitHub Releases、shell tests

---

### Task 1: 先用测试锁定“约定大于配置”的新目标

**Files:**
- Modify: `tests/release-workflow.sh`
- Modify: `tests/npm-release-workflow.sh`
- Test: `tests/release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write the failing workflow assertions**

在 `tests/release-workflow.sh` 中加入：

```bash
if grep -q 'npm_release_package_key' "$file"; then
  echo 'workflow 不应再要求显式传入 npm_release_package_key。' >&2
  exit 1
fi
if grep -q 'npm_release_repository' "$file"; then
  echo 'workflow 不应再要求显式传入 npm_release_repository。' >&2
  exit 1
fi
grep -q 'github.repository' "$file"
```

**Step 2: Write the failing script assertions**

在 `tests/npm-release-workflow.sh` 中加入：

```bash
grep -q 'NPM_PACKAGE_NAME##*/' "$script"
if grep -q 'NPM_RELEASE_PACKAGE_KEY' "$script"; then
  echo '脚本不应再依赖 NPM_RELEASE_PACKAGE_KEY。' >&2
  exit 1
fi
if grep -q 'NPM_RELEASE_REPOSITORY' "$script"; then
  echo '脚本不应再依赖 NPM_RELEASE_REPOSITORY。' >&2
  exit 1
fi
```

**Step 3: Run tests to verify they fail**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: FAIL，失败点来自 workflow 和脚本仍然包含显式 release 输入与依赖。

**Step 4: Re-run to confirm failure reason**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: FAIL，失败仍聚焦于“约定化推导”断言。

### Task 2: 删除 workflow 中显式 release 输入

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Test: `tests/release-workflow.sh`

**Step 1: Remove workflow inputs**

删除：

```yaml
npm_release_package_key
npm_release_repository
```

**Step 2: Use current repository context**

将 GitHub Release 上传相关命令改为直接使用当前仓库上下文，例如：

```yaml
--repo "${{ github.repository }}"
```

或等价实现。

**Step 3: Run targeted workflow test**

Run: `bash tests/release-workflow.sh`
Expected: 仍 FAIL，但失败点应推进到脚本仍依赖显式变量。

### Task 3: 脚本改为从 NPM_PACKAGE_NAME 推导 package-key

**Files:**
- Modify: `scripts/release-npm-package.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Derive package-key**

在脚本中新增：

```bash
release_package_key="${NPM_PACKAGE_NAME##*/}"
```

**Step 2: Replace explicit env dependency**

移除：

```bash
NPM_RELEASE_PACKAGE_KEY
NPM_RELEASE_REPOSITORY
```

并将 release tag、资产名、checksums 文件名全部改为基于 `release_package_key` 生成。

**Step 3: Run targeted script test**

Run: `bash tests/npm-release-workflow.sh`
Expected: PASS 或仅剩 workflow 侧旧说明未同步。

### Task 4: 同步开发文档

**Files:**
- Modify: `docs/developer-guide.md`
- Test: `docs/developer-guide.md`

**Step 1: Replace explicit-input documentation**

将“新增 `npm_release_package_key` / `npm_release_repository` 输入”的描述替换为：

- Release 仓库固定为当前仓库
- package-key 由 `NPM_PACKAGE_NAME` 去 scope 后推导

**Step 2: Add concrete examples**

在文档中补充示例：

```text
@vino.tian/vibe-kanban -> vibe-kanban
```

**Step 3: Verify docs**

Run: `rg -n "npm_release_package_key|npm_release_repository|github.repository|NPM_PACKAGE_NAME##\\*/|vibe-kanban-v" docs/developer-guide.md .github/workflows/release-service.yml scripts/release-npm-package.sh`
Expected: 文档与实现一致，旧的显式输入说明已移除。

### Task 5: 完整验证

**Files:**
- Test: `tests/release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`
- Test: `.github/workflows/release-service.yml`
- Test: `scripts/release-npm-package.sh`
- Test: `docs/developer-guide.md`

**Step 1: Run final verification**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 2: Inspect focused diff**

Run: `git diff -- .github/workflows/release-service.yml scripts/release-npm-package.sh tests/release-workflow.sh tests/npm-release-workflow.sh docs/developer-guide.md docs/plans/2026-03-15-release-service-npm-github-release-convention-design.md docs/plans/2026-03-15-release-service-npm-github-release-convention.md`
Expected: 只包含“约定大于配置”收敛相关改动。

**Step 3: Inspect working tree**

Run: `git status --short`
Expected: 仅出现本次相关文件。
