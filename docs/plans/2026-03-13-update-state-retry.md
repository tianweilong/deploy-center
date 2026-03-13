# update-state Retry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `release-service` 工作流增加基于最新 `origin/main` 重算部署状态并有限重试推送的能力，避免 `update-state` 因并发 push 被拒绝而失败。

**Architecture:** 将 `update-state` 的“写部署状态 + 提交 + 推送重试”逻辑从 GitHub Actions YAML 抽离到独立 shell 脚本。脚本在每次尝试前同步 `origin/main`，重新执行状态写入，并仅在 `git push` 失败时进入下一轮，以确保最终提交始终基于最新主分支状态计算。

**Tech Stack:** GitHub Actions YAML、Bash、Ruby、Git

---

### Task 1: 写并发推送失败的回归测试

**Files:**
- Create: `tests/commit-deployment-state-with-retry.sh`
- Modify: `scripts/update-deployment-state.sh`
- Test: `tests/commit-deployment-state-with-retry.sh`

**Step 1: Write the failing test**

在 `tests/commit-deployment-state-with-retry.sh` 中创建临时 bare repo、初始 `main`、runner clone 与冲突 clone。测试流程需要：

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

remote_repo="$tmpdir/remote.git"
seed_repo="$tmpdir/seed"
runner_repo="$tmpdir/runner"
conflict_repo="$tmpdir/conflict"

git init --bare "$remote_repo"
git clone "$remote_repo" "$seed_repo"
cd "$seed_repo"
git config user.email 'seed@example.com'
git config user.name 'Seed User'
mkdir -p environments/vibe-kanban-remote scripts
cp "$OLDPWD/scripts/update-deployment-state.sh" scripts/update-deployment-state.sh
cat > environments/vibe-kanban-remote/deployment.yaml <<'YAML'
service: vibe-kanban-remote
source:
  ref: refs/heads/main
  sha: oldsha
image:
  repository: old.repo/example
  tag: oldtag
YAML
git add .
git commit -m 'seed'
git push origin HEAD:main
```

再补充 runner clone 与 conflict clone，并调用未来新增的 `scripts/commit-deployment-state-with-retry.sh`。断言最终远端 `deployment.yaml` 为新值，且远端历史包含冲突提交与状态提交。

**Step 2: Run test to verify it fails**

Run: `bash tests/commit-deployment-state-with-retry.sh`
Expected: FAIL with `No such file or directory` because `scripts/commit-deployment-state-with-retry.sh` does not exist yet.

**Step 3: Write minimal implementation**

暂不写生产实现，只把测试补齐到最小可复现状态。

**Step 4: Run test to verify it fails for the expected reason**

Run: `bash tests/commit-deployment-state-with-retry.sh`
Expected: FAIL, and stderr mentions missing `scripts/commit-deployment-state-with-retry.sh`.

**Step 5: Commit**

```bash
git add tests/commit-deployment-state-with-retry.sh
git commit -m "test: 覆盖 update-state 并发推送冲突"
```

### Task 2: 实现基于最新远端重算并重试的提交脚本

**Files:**
- Create: `scripts/commit-deployment-state-with-retry.sh`
- Modify: `scripts/update-deployment-state.sh`
- Test: `tests/commit-deployment-state-with-retry.sh`

**Step 1: Write the failing test**

继续使用 `tests/commit-deployment-state-with-retry.sh` 作为唯一行为测试，明确它要求：

```bash
RELEASE_MATRIX='{"include":[{"service":"vibe-kanban-remote","image_repository":"ghcr.io/tianweilong/vibe-kanban-remote","tag":"v1.2.3"}]}' \
SOURCE_REF='refs/tags/v1.2.3' \
SOURCE_SHA='newsha123' \
SOURCE_TAG='v1.2.3' \
./scripts/commit-deployment-state-with-retry.sh
```

预期脚本第一次 push 失败后仍能成功结束。

**Step 2: Run test to verify it fails**

Run: `bash tests/commit-deployment-state-with-retry.sh`
Expected: FAIL because retry logic is still missing.

**Step 3: Write minimal implementation**

在 `scripts/commit-deployment-state-with-retry.sh` 中实现：

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_MATRIX:?RELEASE_MATRIX 为必填环境变量}"
: "${SOURCE_REF:?SOURCE_REF 为必填环境变量}"
: "${SOURCE_SHA:?SOURCE_SHA 为必填环境变量}"
: "${SOURCE_TAG:?SOURCE_TAG 为必填环境变量}"

max_attempts="${DEPLOYMENT_STATE_PUSH_MAX_ATTEMPTS:-3}"
branch="${DEPLOYMENT_STATE_BRANCH:-main}"

git config user.email 'action@github.com'
git config user.name 'GitHub Action'

update_state() {
  ruby <<'RUBY'
  require 'json'
  matrix = JSON.parse(ENV.fetch('RELEASE_MATRIX')).fetch('include')
  matrix.each do |service|
    ok = system(
      {
        'SERVICE_NAME' => service.fetch('service'),
        'SOURCE_REF' => ENV.fetch('SOURCE_REF'),
        'SOURCE_SHA' => ENV.fetch('SOURCE_SHA'),
        'IMAGE_REPOSITORY' => service.fetch('image_repository'),
        'IMAGE_TAG' => service.fetch('tag')
      },
      './scripts/update-deployment-state.sh'
    )
    abort("更新 #{service.fetch('service')} 失败") unless ok
  end
  RUBY
}

attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  git fetch origin "$branch"
  git reset --hard "origin/$branch"
  update_state

  if git diff --quiet; then
    echo '没有可提交的部署状态变更。'
    exit 0
  fi

  git add environments
  git commit -m "chore: 更新部署状态 (${SOURCE_TAG})"

  if git push origin HEAD:"$branch"; then
    exit 0
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "部署状态推送在 ${max_attempts} 次尝试后仍失败。" >&2
    exit 1
  fi

  attempt=$((attempt + 1))
done
```

如需避免上一轮失败提交残留在本地分支上，保持 `git reset --hard origin/$branch` 位于每轮开头。

**Step 4: Run test to verify it passes**

Run: `bash tests/commit-deployment-state-with-retry.sh`
Expected: PASS, and the remote repo `deployment.yaml` shows `SOURCE_REF=refs/tags/v1.2.3`、`SOURCE_SHA=newsha123`、`IMAGE_TAG=v1.2.3`.

**Step 5: Commit**

```bash
git add scripts/commit-deployment-state-with-retry.sh tests/commit-deployment-state-with-retry.sh
git commit -m "fix: 重试 update-state 并发推送"
```

### Task 3: 切换工作流到新脚本并补静态校验

**Files:**
- Modify: `.github/workflows/release-service.yml:144-178`
- Modify: `tests/release-workflow.sh:1-27`
- Test: `tests/release-workflow.sh`

**Step 1: Write the failing test**

在 `tests/release-workflow.sh` 中新增断言：

```bash
grep -q './scripts/commit-deployment-state-with-retry.sh' "$file"
! grep -q '^          git push$' "$file"
```

**Step 2: Run test to verify it fails**

Run: `bash tests/release-workflow.sh`
Expected: FAIL because workflow still inlines `git push` and does not call the new script.

**Step 3: Write minimal implementation**

把 `.github/workflows/release-service.yml` 的 `update-state` job 改成：

```yaml
      - name: 更新部署状态并提交
        env:
          RELEASE_MATRIX: ${{ needs.prepare.outputs.matrix }}
        run: |
          set -euo pipefail
          ./scripts/commit-deployment-state-with-retry.sh
```

保留 `SOURCE_REF`、`SOURCE_SHA`、`SOURCE_TAG` 作为 job 级环境变量来源，不改现有输入结构。

**Step 4: Run test to verify it passes**

Run: `bash tests/release-workflow.sh`
Expected: PASS with no output.

**Step 5: Commit**

```bash
git add .github/workflows/release-service.yml tests/release-workflow.sh
git commit -m "refactor: 抽离部署状态重试提交流程"
```

### Task 4: 运行回归并更新文档

**Files:**
- Modify: `docs/developer-guide.md:255-320`
- Test: `tests/commit-deployment-state-with-retry.sh`
- Test: `tests/release-workflow.sh`
- Test: `tests/update-deployment-state.sh`

**Step 1: Write the failing test**

文档任务不新增自动化失败用例，沿用已有回归测试集作为保护网。

**Step 2: Run tests before documentation change**

Run: `bash tests/commit-deployment-state-with-retry.sh && bash tests/release-workflow.sh && bash tests/update-deployment-state.sh`
Expected: PASS after Tasks 1-3 are complete.

**Step 3: Write minimal implementation**

在 `docs/developer-guide.md` 的“运行回归测试”与“本地模拟部署状态更新”附近补充说明：

- `commit-deployment-state-with-retry.sh` 负责并发推送冲突时的自动重算与重试
- `update-deployment-state.sh` 只负责单个文件改写，不负责 Git 提交和推送

**Step 4: Run tests to verify it still passes**

Run: `bash tests/commit-deployment-state-with-retry.sh && bash tests/release-workflow.sh && bash tests/update-deployment-state.sh`
Expected: PASS with no warnings.

**Step 5: Commit**

```bash
git add docs/developer-guide.md
git commit -m "docs: 补充部署状态重试提交流程说明"
```
