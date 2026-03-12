# Webhook 协议

## 目标

未来的服务器侧代理会接收 webhook 刷新事件，拉取 `deploy-center`，并将目标环境对齐到 Git 中保存的部署描述文件。

## 预期载荷字段

- `repository`
- `environment`
- `services`
- `sha`
- `ref`
- `deployment_commit`

## 代理职责

1. 校验 webhook 的真实性。
2. 拉取最新的 `deploy-center` 状态。
3. 加载匹配的 `deployment.yaml` 文件。
4. 拉取目标镜像标签。
5. 对齐 Docker Compose 服务状态。
6. 记录本地部署结果。
