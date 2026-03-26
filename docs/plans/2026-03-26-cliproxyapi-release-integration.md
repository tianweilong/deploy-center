# CLIProxyAPI 接入 deploy-center 发布 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `CLIProxyAPI` 在 tag 发布时只通知 `deploy-center`，由 `deploy-center` 统一完成 `tianweilong/cli-proxy-api` 多架构镜像构建与推送。

**Architecture:** 在 `deploy-center` 中新增 `CLIProxyAPI` 的服务配置并复用现有 `release-service.yml`。在 `CLIProxyAPI` 中删除现有 `.github` 内容，仅保留一个 tag 触发的 dispatch workflow；同时将 `Dockerfile` 改成 Buildx 兼容的跨平台 Go 构建。

**Tech Stack:** GitHub Actions、Docker Buildx、Go、JSON、Node.js 测试

---

### Task 1: 锁定 deploy-center 的 CLIProxyAPI 服务矩阵

**Files:**
- Modify: `deploy-center/tests/prepare-release-matrix.mjs`
- Create: `deploy-center/config/services.CLIProxyAPI.json`

**Step 1: Write the failing test**

为 `config/services.CLIProxyAPI.json` 增加断言，要求产出：

- `service=cli-proxy-api`
- `image_repository=tianweilong/cli-proxy-api`
- `context=source`
- `dockerfile=Dockerfile`
- `platforms=linux/amd64,linux/arm64`

**Step 2: Run test to verify it fails**

Run: `node tests/prepare-release-matrix.mjs`

**Step 3: Write minimal implementation**

新增 `config/services.CLIProxyAPI.json` 并填入单服务配置。

**Step 4: Run test to verify it passes**

Run: `node tests/prepare-release-matrix.mjs`

### Task 2: 让 release workflow 支持 Docker Hub 登录

**Files:**
- Modify: `deploy-center/.github/workflows/release-service.yml`
- Modify: `deploy-center/tests/release-workflow.mjs`

**Step 1: Write the failing test**

断言 workflow 包含 registry 解析和 Docker Hub 登录分支。

**Step 2: Run test to verify it fails**

Run: `node tests/release-workflow.mjs`

**Step 3: Write minimal implementation**

根据 `matrix.image_repository` 是否带 registry 前缀，分别登录 `ghcr.io` 或 Docker Hub。

**Step 4: Run test to verify it passes**

Run: `node tests/release-workflow.mjs`

### Task 3: 替换 CLIProxyAPI 的发布 workflow 并改 Dockerfile

**Files:**
- Modify: `CLIProxyAPI/Dockerfile`
- Delete: `CLIProxyAPI/.github/*`
- Create: `CLIProxyAPI/.github/workflows/release.yml`

**Step 1: 实现跨平台 Dockerfile**

使用 `TARGETOS/TARGETARCH/TARGETVARIANT` 驱动 `go build`。

**Step 2: 实现 deploy-center dispatch workflow**

tag push 时向 `deploy-center` 发送 `deploy-center-release` 事件，`release_targets=cli-proxy-api`。

### Task 4: 完整验证

**Files:**
- Test: `deploy-center/tests/prepare-release-matrix.mjs`
- Test: `deploy-center/tests/release-workflow.mjs`
- Test: `CLIProxyAPI/.github/workflows/release.yml`
- Test: `CLIProxyAPI/Dockerfile`

**Step 1: 运行 deploy-center 测试**

Run: `node tests/prepare-release-matrix.mjs && node tests/release-workflow.mjs`

**Step 2: 校验 workflow YAML**

Run: `python3 - <<'PY'\nimport yaml, pathlib\nfor path in [pathlib.Path('CLIProxyAPI/.github/workflows/release.yml'), pathlib.Path('deploy-center/.github/workflows/release-service.yml')]:\n    yaml.safe_load(path.read_text())\nprint('yaml ok')\nPY`

**Step 3: 检查最终差异**

Run: `git diff -- CLIProxyAPI deploy-center`
