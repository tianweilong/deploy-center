# 部署中心

一个私有的、多服务部署控制中心。

该仓库存放以环境为先的部署状态、发布工作流，以及未来面向多服务的拉取式部署集成入口。

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

## Developer docs

- Developer guide: `docs/developer-guide.md`
- Architecture notes: `docs/architecture.md`
- Rollout guide: `docs/rollout.md`
