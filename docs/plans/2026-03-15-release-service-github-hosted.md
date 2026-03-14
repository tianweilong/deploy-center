# release-service 切回 GitHub Hosted Runner 与 Trusted Publishing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `release-service` 工作流中的所有自托管 runner 替换为 GitHub Hosted Runner，并把 npm 发布从 `NPM_TOKEN` 切回 Trusted Publishing，同时保持现有发布输入与版本计算逻辑不变。

**Architecture:** 工作流层面恢复 `id-token: write`，将 Linux 构建切到 `ubuntu-latest`、macOS 发布切到标准 `macos-15`。发布脚本层面移除对 `NODE_AUTH_TOKEN` 的强制要求，让 `npm publish` 直接依赖 GitHub Actions OIDC 与 npm Trusted Publishing 建立的短期凭证完成发布。

**Tech Stack:** GitHub Actions YAML、Bash、ripgrep、npm、pnpm

---

### Task 1: 先用测试锁定目标行为

**Files:**
- Modify: `tests/release-workflow.sh`
- Modify: `tests/npm-release-workflow.sh`
- Test: `tests/release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write the failing tests**

将 workflow 测试改为断言：

```bash
grep -q 'id-token: write' "$file"
! grep -q '\[self-hosted, Linux, ARM64\]' "$file"
! grep -q '\[self-hosted, macOS, ARM64\]' "$file"
grep -q 'runs-on: ubuntu-latest' "$file"
grep -q 'runs-on: macos-15' "$file"
! grep -q 'NODE_AUTH_TOKEN' "$file"
```

将 npm 发布测试改为断言：

```bash
if grep -q 'NODE_AUTH_TOKEN' "$script"; then
  echo 'Trusted Publishing 发布脚本不应再依赖 NODE_AUTH_TOKEN。' >&2
  exit 1
fi
```

**Step 2: Run tests to verify they fail**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: FAIL，因为当前 workflow 仍使用 self-hosted runner，且 workflow 与脚本中仍有 `NODE_AUTH_TOKEN` / token 相关断言。

**Step 3: Keep implementation unchanged**

此时不修改生产文件，只确认失败原因与 runner / token 断言一致。

**Step 4: Re-run tests to verify failure reason**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: FAIL，失败点明确来自 Trusted Publishing 目标断言。

### Task 2: 最小化调整 workflow

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Test: `tests/release-workflow.sh`

**Step 1: Restore workflow permission**

在顶层 `permissions` 下恢复：

```yaml
id-token: write
```

**Step 2: Switch hosted runners**

将：

```yaml
runs-on: [self-hosted, Linux, ARM64]
```

改为：

```yaml
runs-on: ubuntu-latest
```

将：

```yaml
runs-on: [self-hosted, macOS, ARM64]
```

改为：

```yaml
runs-on: macos-15
```

并移除 `release-npm` job 的 `NODE_AUTH_TOKEN` 注入。

**Step 3: Run targeted workflow test**

Run: `bash tests/release-workflow.sh`
Expected: PASS

### Task 3: 最小化调整 npm 发布脚本

**Files:**
- Modify: `scripts/release-npm-package.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Remove token requirement**

删除：

```bash
: "${NODE_AUTH_TOKEN:?缺少 NODE_AUTH_TOKEN}"
```

并将发布日志从“通过 NPM_TOKEN 发布”改为 Trusted Publishing 语义。

**Step 2: Keep publish command unchanged**

保留：

```bash
npm publish "$PACKAGE_FILE" --access public
```

不额外加 `--provenance`，依赖 Trusted Publishing 自动生成 provenance。

**Step 3: Run targeted script test**

Run: `bash tests/npm-release-workflow.sh`
Expected: PASS

### Task 4: 完整验证

**Files:**
- Test: `tests/release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`
- Test: `.github/workflows/release-service.yml`
- Test: `scripts/release-npm-package.sh`

**Step 1: Run final verification**

Run: `bash tests/release-workflow.sh && bash tests/npm-release-workflow.sh`
Expected: PASS

**Step 2: Inspect diff**

Run: `git diff -- .github/workflows/release-service.yml scripts/release-npm-package.sh tests/release-workflow.sh tests/npm-release-workflow.sh docs/plans/2026-03-15-release-service-github-hosted-design.md docs/plans/2026-03-15-release-service-github-hosted.md`
Expected: 只包含 runner、Trusted Publishing、测试与文档变更。

**Step 3: Inspect working tree**

Run: `git status --short`
Expected: 仅出现本次相关文件。
