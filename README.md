# 部署中心

一个私有的、多服务部署配置与发布工作流仓库。

该仓库存放以环境为先的部署状态、服务构建矩阵，以及面向 `vibe-kanban` 相关服务的发布工作流。

## GitHub 配置

必需的仓库密钥：

- `SOURCE_REPO_TOKEN`

必需的工作流权限：

- `GITHUB_TOKEN` 需要具备 `packages: write`

必需的环境变量：

- `dev` -> `VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL`
- `prod` -> `VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL`

必需的部署主机凭据：

- 具备 `read:packages` 的经典 PAT
- `docker login ghcr.io`

`vibe-kanban` 仅保留一个触发密钥：

- `DEPLOY_CENTER_TRIGGER_TOKEN`

## 镜像构建平台

`release-service` 工作流默认同时构建以下平台镜像：

- `linux/amd64`
- `linux/arm64`

如某个服务需要单独限制平台，可在 `config/services.vibe-kanban.json` 中为该服务显式配置 `platforms` 字段覆盖默认值。

## 开发文档

- 开发指南：`docs/developer-guide.md`
- 架构说明：`docs/architecture.md`
- 发布落地指南：`docs/rollout.md`
