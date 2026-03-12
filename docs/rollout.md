# 发布落地指南

## 必需的仓库密钥

- `VK_PRIVATE_DEPLOY_KEY`
- `SOURCE_REPO_TOKEN`

## 必需的部署主机凭据

- 具备 `read:packages` 的经典 PAT
- 登录命令：`docker login ghcr.io`

## 应用仓库必需的触发密钥

源仓库仍需要一个权限收敛的触发密钥，用来启动 `deploy-center` 中的工作流。
在 `tianweilong/vibe-kanban` 中建议使用以下名称：

- `DEPLOY_CENTER_TRIGGER_TOKEN`
