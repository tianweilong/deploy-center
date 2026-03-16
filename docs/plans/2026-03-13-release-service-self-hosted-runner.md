# release-service 自建 Runner 迁移 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `release-service` 工作流中的 `build` job 迁移到 `self-hosted, Linux, ARM64` 自建 Runner，同时保持其余 job 和现有发布行为不变。

**Architecture:** 保持三段式工作流结构不变，只调整 `build` job 的执行机器。先通过 shell 测试锁定目标行为，再对工作流 YAML 做最小修改，最后同步开发文档说明 build 阶段已改为自建 Runner 执行。

**Tech Stack:** GitHub Actions YAML、Bash、ripgrep、现有 shell 测试

---

### Task 1: 为自建 Runner 行为补充测试

**Files:**
- Modify: `tests/release-workflow.sh`
- Test: `tests/release-workflow.sh`

**Step 1: Write the failing test**

在 `tests/release-workflow.sh` 中新增断言，要求：

```bash
grep -q 'runs-on: \[self-hosted, Linux, ARM64\]' "$file"
```

并保留现有关于 `ubuntu-latest`、`docker/setup-qemu-action@v3`、`docker/build-push-action@v6` 等断言。

**Step 2: Run test to verify it fails**

Run: `bash tests/release-workflow.sh`
Expected: FAIL，因为当前工作流中的 `build` job 仍然是 `runs-on: ubuntu-latest`。

**Step 3: Write minimal implementation**

无需修改生产代码，本任务只添加失败测试。

**Step 4: Run test to verify it fails for the right reason**

Run: `bash tests/release-workflow.sh`
Expected: FAIL，失败原因来自新增的自建 Runner 断言。

**Step 5: Commit**

```bash
git add tests/release-workflow.sh
git commit -m "test: cover self-hosted build runner"
```

### Task 2: 将 build job 切换到自建 Runner

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Test: `tests/release-workflow.sh`

**Step 1: Write the minimal implementation**

将 `build` job 的运行环境从：

```yaml
runs-on: ubuntu-latest
```

改为：

```yaml
runs-on: [self-hosted, Linux, ARM64]
```

仅修改 `build` job，保持 `prepare` 与 `update-state` 继续使用 `ubuntu-latest`。

**Step 2: Run targeted test**

Run: `bash tests/release-workflow.sh`
Expected: PASS

**Step 3: Review for unintended changes**

Run: `git diff -- .github/workflows/release-service.yml tests/release-workflow.sh`
Expected: 只看到 `build` job 的 `runs-on` 修改与测试断言新增。

**Step 4: Commit**

```bash
git add .github/workflows/release-service.yml tests/release-workflow.sh
git commit -m "ci: move image build job to self-hosted runner"
```

### Task 3: 更新开发文档说明执行环境

**Files:**
- Modify: `docs/developer-guide.md`
- Test: `docs/developer-guide.md`

**Step 1: Update documentation**

将 `build` 阶段说明中的执行环境补充为：
- `prepare` 与 `update-state` 在 GitHub 托管 Runner 上执行。
- `build` 在 `self-hosted, Linux, ARM64` 自建 Runner 上执行。

**Step 2: Run a focused documentation check**

Run: `rg -n "build 阶段|self-hosted|ARM64|ubuntu-latest" docs/developer-guide.md .github/workflows/release-service.yml`
Expected: 能同时看到工作流配置与文档说明中关于自建 Runner 的描述。

**Step 3: Review final diff**

Run: `git diff -- .github/workflows/release-service.yml tests/release-workflow.sh docs/developer-guide.md`
Expected: 仅包含本次需求相关改动。

**Step 4: Commit**

```bash
git add .github/workflows/release-service.yml tests/release-workflow.sh docs/developer-guide.md
git commit -m "docs: document self-hosted release build runner"
```

### Task 4: 完整验证

**Files:**
- Test: `tests/release-workflow.sh`

**Step 1: Run final verification**

Run: `bash tests/release-workflow.sh`
Expected: PASS

**Step 2: Inspect final status**

Run: `git status --short`
Expected: 仅显示本次修改文件，且无意外变更。

**Step 3: Hand off summary**

总结变更文件、Runner 标签、测试命令与验证结果，并提醒用户确保仓库或组织中确实存在带 `self-hosted`、`Linux`、`ARM64` 标签的在线 Runner。
