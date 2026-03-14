# release-service 打印 Runner 信息 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `release-service` 工作流的 `build` 和 `release-npm` 两个 job 中打印 runner 的基础系统信息和资源信息，便于从日志中判断 GitHub-hosted runner 的大致性能。

**Architecture:** 直接在 workflow 中为 Linux 与 macOS 各添加一个内联 shell step，输出 `RUNNER_*` 环境信息、CPU / 内存 / 磁盘等关键指标，以及与该 job 强相关的工具版本。通过更新现有 workflow 测试先锁定目标行为，再用最小改动完成实现。

**Tech Stack:** GitHub Actions YAML、Bash、Linux 系统命令、macOS 系统命令、ripgrep

---

### Task 1: 先用测试锁定 runner 信息输出

**Files:**
- Modify: `tests/release-workflow.sh`
- Test: `tests/release-workflow.sh`

**Step 1: Write the failing test**

在 `tests/release-workflow.sh` 中新增断言，要求 workflow 包含：

```bash
grep -q '打印 Linux Runner 信息' "$file"
grep -q '打印 macOS Runner 信息' "$file"
grep -q 'RUNNER_OS=${RUNNER_OS}' "$file"
grep -q 'RUNNER_ARCH=${RUNNER_ARCH}' "$file"
grep -q 'lscpu' "$file"
grep -q 'free -h' "$file"
grep -q 'sw_vers' "$file"
grep -q 'machdep.cpu.brand_string' "$file"
grep -q 'hw.memsize' "$file"
```

**Step 2: Run test to verify it fails**

Run: `bash tests/release-workflow.sh`
Expected: FAIL，因为当前 workflow 还没有 runner 信息输出步骤。

**Step 3: Keep implementation unchanged**

暂不修改 workflow，只确认失败来自新增断言。

**Step 4: Re-run test to verify failure reason**

Run: `bash tests/release-workflow.sh`
Expected: FAIL，失败点与 runner 信息输出断言一致。

### Task 2: 在 build job 中打印 Linux runner 信息

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Test: `tests/release-workflow.sh`

**Step 1: Add Linux runner info step**

在 `build` job 的 checkout 之后新增 step，输出：

```yaml
- name: 打印 Linux Runner 信息
  run: |
    echo "RUNNER_OS=${RUNNER_OS}"
    echo "RUNNER_ARCH=${RUNNER_ARCH}"
    echo "RUNNER_NAME=${RUNNER_NAME}"
    uname -a
    lscpu
    free -h
    df -h
    docker version
    docker buildx version
```

可根据日志长度适当精简格式，但保留 CPU / 内存 / 磁盘与 Docker 版本信息。

**Step 2: Run targeted test**

Run: `bash tests/release-workflow.sh`
Expected: 仍可能 FAIL，因为 macOS step 还未添加。

### Task 3: 在 release-npm job 中打印 macOS runner 信息

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Test: `tests/release-workflow.sh`

**Step 1: Add macOS runner info step**

在 `release-npm` job 的 checkout 之后新增 step，输出：

```yaml
- name: 打印 macOS Runner 信息
  run: |
    echo "RUNNER_OS=${RUNNER_OS}"
    echo "RUNNER_ARCH=${RUNNER_ARCH}"
    echo "RUNNER_NAME=${RUNNER_NAME}"
    sw_vers
    sysctl -n machdep.cpu.brand_string
    sysctl -n hw.ncpu
    sysctl -n hw.memsize
    df -h
    node --version
    npm --version
```

**Step 2: Run test to verify it passes**

Run: `bash tests/release-workflow.sh`
Expected: PASS

### Task 4: 完整验证

**Files:**
- Test: `tests/release-workflow.sh`
- Test: `.github/workflows/release-service.yml`

**Step 1: Run workflow test**

Run: `bash tests/release-workflow.sh`
Expected: PASS

**Step 2: Validate YAML**

Run: `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/release-service.yml'); puts 'YAML OK'"`
Expected: PASS，并输出 `YAML OK`

**Step 3: Inspect diff**

Run: `git diff -- .github/workflows/release-service.yml tests/release-workflow.sh docs/plans/2026-03-15-release-service-runner-info-design.md docs/plans/2026-03-15-release-service-runner-info.md`
Expected: 仅包含 runner 信息输出、测试与文档变更。
