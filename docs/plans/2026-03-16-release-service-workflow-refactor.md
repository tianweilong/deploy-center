# release-service workflow 公共步骤抽取 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `release-service` workflow 中重复的 checkout、Node/pnpm 环境准备和 runner 信息打印抽成 3 个 composite action，同时保持主 workflow 的发布编排可读性与现有发布行为不变。

**Architecture:** 在 `.github/actions/` 下新增 `checkout-source`、`setup-node-pnpm`、`print-runner-info` 三个 composite action，只封装稳定公共步骤；`.github/workflows/release-service.yml` 继续保留触发、矩阵、条件判断与实际发布动作。通过先更新 shell 测试锁定 action 引用，再做 workflow 重构，最后用 YAML 解析和现有测试回归确认行为未变。

**Tech Stack:** GitHub Actions YAML、Composite Actions、Bash、PowerShell、Ruby YAML 解析、现有 shell 测试

---

### Task 1: 先用测试锁定新的 workflow 结构

**Files:**
- Modify: `tests/release-workflow.sh`
- Modify: `tests/npm-release-workflow.sh`
- Test: `tests/release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write the failing test**

在 `tests/release-workflow.sh` 中新增断言，要求 workflow 引用：

```bash
grep -q 'uses: ./.github/actions/checkout-source' "$file"
grep -q 'uses: ./.github/actions/print-runner-info' "$file"
```

在 `tests/npm-release-workflow.sh` 中新增断言，要求 workflow 引用：

```bash
grep -q 'uses: ./.github/actions/setup-node-pnpm' "$workflow"
grep -q 'lockfile-path: source/pnpm-lock.yaml' "$workflow"
grep -q 'npm-version: 11.5.1' "$workflow"
```

并删除对即将被抽走的内联实现细节断言，例如直接 grep `actions/setup-node@v5`、`pnpm store path --silent`、平台打印脚本正文等。

**Step 2: Run test to verify it fails**

Run: `bash tests/release-workflow.sh`
Expected: FAIL，因为 workflow 还未引用新的 composite action。

**Step 3: Run second test to verify it fails**

Run: `bash tests/npm-release-workflow.sh`
Expected: FAIL，因为 workflow 还未引用 `setup-node-pnpm`。

**Step 4: Keep implementation unchanged**

此时不改 workflow，只确认失败来自新增断言，而不是现有回归。

### Task 2: 新增 `checkout-source` composite action

**Files:**
- Create: `.github/actions/checkout-source/action.yml`
- Test: `tests/release-workflow.sh`

**Step 1: Write minimal action**

创建 `.github/actions/checkout-source/action.yml`，包含：

```yaml
name: 检出源仓库
description: 检出当前仓库，并将源仓库检出到指定目录
inputs:
  repository:
    required: true
  ref:
    required: true
  path:
    required: false
    default: source
  token:
    required: true
  fetch-depth:
    required: false
    default: '0'
runs:
  using: composite
  steps:
    - uses: actions/checkout@v6
    - uses: actions/checkout@v6
      with:
        repository: ${{ inputs.repository }}
        ref: ${{ inputs.ref }}
        path: ${{ inputs.path }}
        token: ${{ inputs.token }}
        fetch-depth: ${{ inputs.fetch-depth }}
```

**Step 2: Validate YAML**

Run: `ruby -e "require 'yaml'; YAML.load_file('.github/actions/checkout-source/action.yml'); puts 'YAML OK'"`
Expected: PASS

**Step 3: Keep workflow unchanged**

暂不替换 workflow，先保证 action 文件本身合法。

### Task 3: 新增 `setup-node-pnpm` composite action

**Files:**
- Create: `.github/actions/setup-node-pnpm/action.yml`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Write minimal action**

创建 `.github/actions/setup-node-pnpm/action.yml`，封装：

```yaml
- uses: actions/setup-node@v5
  with:
    node-version: ${{ inputs.node-version }}
- uses: pnpm/action-setup@v4
  with:
    version: ${{ inputs.pnpm-version }}
- shell: bash
  run: echo "STORE_PATH=$(pnpm store path --silent)" >> "$GITHUB_ENV"
- uses: actions/cache@v4
  with:
    path: ${{ env.STORE_PATH }}
    key: ${{ runner.os }}-${{ runner.arch }}-pnpm-store-${{ hashFiles(inputs.lockfile-path) }}
    restore-keys: |
      ${{ runner.os }}-${{ runner.arch }}-pnpm-store-
- shell: bash
  run: npm install -g npm@${{ inputs.npm-version }}
```

输入为：

- `node-version`
- `pnpm-version`
- `lockfile-path`
- `npm-version`

**Step 2: Validate YAML**

Run: `ruby -e "require 'yaml'; YAML.load_file('.github/actions/setup-node-pnpm/action.yml'); puts 'YAML OK'"`
Expected: PASS

**Step 3: Keep workflow unchanged**

先不替换 workflow，保证 action 文件独立合法。

### Task 4: 新增 `print-runner-info` composite action

**Files:**
- Create: `.github/actions/print-runner-info/action.yml`
- Test: `tests/release-workflow.sh`

**Step 1: Write minimal action**

创建 `.github/actions/print-runner-info/action.yml`，用 3 个条件 step 分支处理：

```yaml
inputs:
  target-os:
    required: true
```

包含：

- `if: inputs.target-os == 'linux'` 的 bash step
- `if: inputs.target-os == 'win32'` 的 pwsh step
- `if: inputs.target-os == 'darwin'` 的 bash step
- 一个未知值保护 step，若不在三者之内则失败退出

命令内容保持与当前 workflow 中的 Linux / Windows / macOS runner 信息打印等价。

**Step 2: Validate YAML**

Run: `ruby -e "require 'yaml'; YAML.load_file('.github/actions/print-runner-info/action.yml'); puts 'YAML OK'"`
Expected: PASS

### Task 5: 用 composite action 替换 workflow 中的重复步骤

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Test: `tests/release-workflow.sh`
- Test: `tests/npm-release-workflow.sh`

**Step 1: Replace repeated checkout**

将以下 job 中的“双 checkout”替换为 `./.github/actions/checkout-source`：

- `build`
- `release-npm-assets`
- `release-github-release`
- `release-npm`

保留 `prepare` 与 `update-state` 中单独的 `actions/checkout@v6`。

**Step 2: Replace Node/pnpm setup**

将 `release-npm-assets` 与 `release-npm` 中重复的 Node/pnpm/cache/npm 升级步骤替换为 `./.github/actions/setup-node-pnpm`，并传入：

```yaml
node-version: 24
pnpm-version: 10.13.1
lockfile-path: source/pnpm-lock.yaml
npm-version: 11.5.1
```

**Step 3: Replace runner info logging**

将 `build` 中的 Linux 日志步骤替换为：

```yaml
- uses: ./.github/actions/print-runner-info
  with:
    target-os: linux
```

将 `release-npm-assets` 中按平台分支的 3 个日志步骤替换为：

```yaml
- uses: ./.github/actions/print-runner-info
  with:
    target-os: ${{ matrix.target_os }}
```

**Step 4: Run tests to verify they pass**

Run: `bash tests/release-workflow.sh`
Expected: PASS

Run: `bash tests/npm-release-workflow.sh`
Expected: PASS

### Task 6: 完整静态验证与差异检查

**Files:**
- Test: `.github/workflows/release-service.yml`
- Test: `.github/actions/checkout-source/action.yml`
- Test: `.github/actions/setup-node-pnpm/action.yml`
- Test: `.github/actions/print-runner-info/action.yml`

**Step 1: Validate all YAML files**

Run: `ruby -e "require 'yaml'; %w[.github/workflows/release-service.yml .github/actions/checkout-source/action.yml .github/actions/setup-node-pnpm/action.yml .github/actions/print-runner-info/action.yml].each { |f| YAML.load_file(f) }; puts 'YAML OK'"`
Expected: PASS，并输出 `YAML OK`

**Step 2: Run optional actionlint if available**

Run: `command -v actionlint >/dev/null && actionlint .github/workflows/release-service.yml || true`
Expected: 若安装则 PASS；未安装则跳过

**Step 3: Inspect diff**

Run: `git diff -- .github/workflows/release-service.yml .github/actions/checkout-source/action.yml .github/actions/setup-node-pnpm/action.yml .github/actions/print-runner-info/action.yml tests/release-workflow.sh tests/npm-release-workflow.sh docs/plans/2026-03-16-release-service-workflow-refactor-design.md docs/plans/2026-03-16-release-service-workflow-refactor.md`
Expected: 仅包含 workflow 重构、3 个新 action、测试更新与文档新增。

**Step 4: Commit**

```bash
git add .github/workflows/release-service.yml \
  .github/actions/checkout-source/action.yml \
  .github/actions/setup-node-pnpm/action.yml \
  .github/actions/print-runner-info/action.yml \
  tests/release-workflow.sh \
  tests/npm-release-workflow.sh \
  docs/plans/2026-03-16-release-service-workflow-refactor-design.md \
  docs/plans/2026-03-16-release-service-workflow-refactor.md
git commit -m "refactor: 抽取 release-service workflow 公共步骤"
```
