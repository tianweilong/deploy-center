# 发布落地指南

## 必需的 GitHub App 配置

发布链路统一使用 GitHub App，不再配置独立 PAT。

在 `deploy-center`、`vibe-kanban`、`myte` 等参与发布的仓库中配置：

- Variable：`DEPLOY_CENTER_APP_CLIENT_ID`
- Secret：`DEPLOY_CENTER_APP_PRIVATE_KEY`

GitHub App 安装范围至少包含：

- `tianweilong/deploy-center`
- `tianweilong/vibe-kanban`
- `tianweilong/myte`

Repository permissions 至少包含 `Contents: Read and write`。

## 必需的 npm Trusted Publishing 配置

在 npm 包设置中为每个包配置 trusted publisher：

- Repository：`tianweilong/deploy-center`
- Workflow：`release-service.yml`
- Environment：留空，除非 workflow 后续显式配置同名 environment

该模式依赖 GitHub Actions 的 `id-token: write`，不需要 `NPM_TOKEN`。

Trusted Publishing 侧允许的 action 至少选择 `npm publish`。当前 workflow 使用 GitHub-hosted runner、Node 24 与 npm 11.5.1。

## 必需的部署主机凭据

- 具备 `read:packages` 的经典 PAT
- 登录命令：`docker login ghcr.io`
