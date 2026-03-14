# 部署中心

一个私有的、多服务部署配置与统一发布编排仓库。

该仓库保存 `vibe-kanban` 相关服务的部署状态、镜像构建矩阵，以及正式发布工作流。当前它同时负责两类发布目标：

- `vibe-kanban-remote` 与 `vibe-kanban-relay` 的镜像构建与部署状态回写
- `@vino.tian/vibe-kanban` 的 npm 打包与发布

## GitHub 配置

必需的仓库密钥：

- `SOURCE_REPO_TOKEN`

必需的工作流权限：

- `GITHUB_TOKEN` 需要具备 `packages: write`
- `GITHUB_TOKEN` 需要具备 `id-token: write`，用于 npm provenance 发布

必需的仓库变量：

- `VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL`

必需的部署主机凭据：

- 具备 `read:packages` 的经典 PAT
- `docker login ghcr.io`

`vibe-kanban` 侧仅保留一个触发密钥：

- `DEPLOY_CENTER_TRIGGER_TOKEN`

## 统一发布模型

应用仓库 `vibe-kanban` 在推送正式标签后，会向本仓库发送一次 `repository_dispatch`。当前统一 payload 至少包含：

- `source_repository`
- `source_ref`
- `source_sha`
- `source_tag`
- `release_targets`
- `npm_package_name`

标准正式发布的 `release_targets` 为：

- `remote`
- `relay`
- `npm`

当 payload 中包含 `npm` 时，`npm_package_name` 必须提供，当前固定为：

- `@vino.tian/vibe-kanban`

## 镜像构建平台

`release-service` 工作流默认同时构建以下平台镜像：

- `linux/amd64`
- `linux/arm64`

如某个服务需要单独限制平台，可在 `config/services.vibe-kanban.json` 中为该服务显式配置 `platforms` 字段覆盖默认值。

## npm 打包说明

当前 npm 发布路径会在 macOS Runner 上检出源仓库并执行：

- `pnpm i --frozen-lockfile`
- `pnpm run build:npx`
- `npm publish --provenance --access public`（Trusted Publishing）

最终用户通过以下命令启动本地服务：

```bash
npx @vino.tian/vibe-kanban
```

> 前提：需要先在 npm 后台把 `deploy-center` 仓库配置成 `@vino.tian/vibe-kanban` 的 Trusted Publisher。

## 开发文档

- 开发指南：`docs/developer-guide.md`
- 架构说明：`docs/architecture.md`
- 发布落地指南：`docs/rollout.md`
