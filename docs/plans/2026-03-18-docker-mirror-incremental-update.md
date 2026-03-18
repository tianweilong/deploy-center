# Docker Mirror Incremental Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `docker-mirror` 增加 `bitwarden` 镜像目录，并在 `deploy-center` 中补齐对应的服务构建映射。

**Architecture:** `docker-mirror` 继续采用 `images/<目录名>/Dockerfile` 的极简代理模式，只新增 `images/bitwarden` 目录并复用现有变更识别 workflow。`deploy-center` 通过新增 `config/services.docker-mirror.json` 把 6 个镜像目录映射为 GHCR 发布目标，并用现有矩阵脚本和 shell 测试校验配置可被正确解析。

**Tech Stack:** GitHub Actions、JSON、Bash、Ruby、Dockerfile

---

### Task 1: 为 docker-mirror 服务配置补失败用例

**Files:**
- Modify: `tests/prepare-release-matrix.sh`
- Test: `tests/prepare-release-matrix.sh`

**Step 1: Write the failing test**

在 `tests/prepare-release-matrix.sh` 中新增 `docker-mirror` 用例，要求 `config/services.docker-mirror.json` 返回 6 个服务，并覆盖 `bitwarden` 的镜像仓库、构建上下文和 `latest` 标签。

**Step 2: Run test to verify it fails**

Run: `bash tests/prepare-release-matrix.sh`
Expected: FAIL，因为 `config/services.docker-mirror.json` 还不存在。

**Step 3: Write minimal implementation**

创建 `config/services.docker-mirror.json`，声明 `postgres16`、`azure-storage-azurite`、`azure-cli`、`electricsql-electric`、`nginx`、`bitwarden` 六个服务。

**Step 4: Run test to verify it passes**

Run: `bash tests/prepare-release-matrix.sh`
Expected: PASS

### Task 2: 更新 docker-mirror 仓库内容

**Files:**
- Modify: `/private/var/folders/68/x1702s6s6mn7lrr47g5d71hm0000gn/T/vibe-kanban-dev/worktrees/4ae4-docker-mirror/docker-mirror/README.md`
- Create: `/private/var/folders/68/x1702s6s6mn7lrr47g5d71hm0000gn/T/vibe-kanban-dev/worktrees/4ae4-docker-mirror/docker-mirror/images/bitwarden/Dockerfile`
- Create: `/private/var/folders/68/x1702s6s6mn7lrr47g5d71hm0000gn/T/vibe-kanban-dev/worktrees/4ae4-docker-mirror/docker-mirror/images/bitwarden/.dockerignore`

**Step 1: Write minimal implementation**

补充 `images/bitwarden` 目录，`Dockerfile` 使用 `FROM vaultwarden/server:1.35.4-alpine`，README 同步记录新的镜像映射。

**Step 2: Verify repository content**

Run: `grep -n '^FROM ' images/*/Dockerfile`
Expected: 包含 `images/bitwarden/Dockerfile:1:FROM vaultwarden/server:1.35.4-alpine`

### Task 3: 完整校验与提交

**Files:**
- Test: `tests/prepare-release-matrix.sh`
- Test: `.github/workflows/release-service.yml`
- Test: `/private/var/folders/68/x1702s6s6mn7lrr47g5d71hm0000gn/T/vibe-kanban-dev/worktrees/4ae4-docker-mirror/docker-mirror/.github/workflows/release.yml`

**Step 1: Run verification**

Run: `bash tests/prepare-release-matrix.sh`
Expected: PASS

Run: `bash tests/release-workflow.sh`
Expected: PASS

Run: `ruby -e "require 'yaml'; YAML.load_file('/private/var/folders/68/x1702s6s6mn7lrr47g5d71hm0000gn/T/vibe-kanban-dev/worktrees/4ae4-docker-mirror/docker-mirror/.github/workflows/release.yml'); puts 'YAML OK'"`
Expected: PASS

**Step 2: Commit**

```bash
git add config/services.docker-mirror.json tests/prepare-release-matrix.sh docs/plans/2026-03-18-docker-mirror-incremental-update.md
git commit -m "feat: add docker-mirror service mappings"

git -C /private/var/folders/68/x1702s6s6mn7lrr47g5d71hm0000gn/T/vibe-kanban-dev/worktrees/4ae4-docker-mirror/docker-mirror add README.md images/bitwarden
git -C /private/var/folders/68/x1702s6s6mn7lrr47g5d71hm0000gn/T/vibe-kanban-dev/worktrees/4ae4-docker-mirror/docker-mirror commit -m "feat: add bitwarden mirror image"
git -C /private/var/folders/68/x1702s6s6mn7lrr47g5d71hm0000gn/T/vibe-kanban-dev/worktrees/4ae4-docker-mirror/docker-mirror push
```
