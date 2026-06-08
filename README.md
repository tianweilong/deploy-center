# 部署中心

一个私有的、多服务发布编排仓库。

该仓库保存 `vibe-kanban` 相关服务的镜像构建配置，以及正式发布工作流。当前它同时负责两类发布目标：

- `vibe-kanban-remote` 与 `vibe-kanban-relay` 的 GHCR 镜像构建
- `@vino.tian/vibe-kanban` 的 npm 打包与发布

## GitHub 配置

发布链路统一使用 GitHub App，不再配置独立 PAT：

- App 安装到 `tianweilong`，并授予 `deploy-center`、`vibe-kanban`、`myte` 等发布相关仓库访问权限。
- App Repository permissions 至少包含 `Contents: Read and write`；触发仓库用它向 `deploy-center` 发送 `repository_dispatch`，`deploy-center` 用它检出源仓库。

必需的仓库变量与密钥：

- `DEPLOY_CENTER_APP_ID`：GitHub App ID。
- `DEPLOY_CENTER_APP_PRIVATE_KEY`：GitHub App private key PEM。

必需的工作流权限：

- `contents: write`：`GITHUB_TOKEN` 用于在 `deploy-center` 创建 GitHub Release 和上传资产。
- `packages: write`：`GITHUB_TOKEN` 用于推送 GHCR 镜像。
- `id-token: write`：npm Trusted Publishing 使用 OIDC 发包，不需要 `NPM_TOKEN`。

当前 workflow 使用 GitHub-hosted runner、Node 24 与 npm 11.5.1，满足 npm Trusted Publishing 对 OIDC 发布环境的要求。

必需的部署主机凭据：

- 具备 `read:packages` 的经典 PAT
- `docker login ghcr.io`

## 统一发布模型

业务仓在推送正式 tag 后向本仓库发送 `repository_dispatch`。payload 只包含：

- `service_name`
- `source_ref`
- `source_sha`
- `source_tag`

`source_tag` 必须匹配 `vYYYY.M.D-tHHmm`，例如 `v2026.4.19-t1116`。`latest`、`vX.Y.Z` 和 `2026.04.19.1` 这类旧格式不能作为输入 tag。

服务的源码仓、Dockerfile、GHCR 镜像仓库、npm 包名、npm 包目录和 npm 版本策略由 `config/services.yaml` 维护。

## 镜像发布

镜像服务只发布到 GHCR。构建成功后会推送两个 tag：

- `${SOURCE_TAG}`：不可变正式发布 tag。
- `latest`：供 `docker-compose.yaml` 使用，便于拉取最新镜像而不改 compose 文件。

当前不执行 ACR mirror，也不更新 candidate release 或触发测试环境部署。

## npm 发布

npm 服务使用 `calendar_tag` 版本策略：`v2026.4.19-t1116` 会发布为 npm version `2026.4.19-t1116`，即正式 tag 去掉前导 `v`。

该版本在 npm 语义中属于 prerelease，因此发布时显式使用 `--tag latest`。这是本仓库的产品约定：内部工具通过 `npm install <pkg>` 或 `npx <pkg>` 默认获取最新 calendar 发布版本。

当前 npm 发布路径会检出源仓库并执行：

- `pnpm i --frozen-lockfile`
- `pnpm run build:npx`
- `npm version "$PUBLISH_VERSION" --no-git-tag-version --allow-same-version`
- `npm publish --access public --tag latest`

最终用户通过以下命令启动本地 CLI：

```bash
npx @vino.tian/vibe-kanban
```

## 开发文档

- 开发指南：`docs/developer-guide.md`
- 架构说明：`docs/architecture.md`
- 发布落地指南：`docs/rollout.md`
