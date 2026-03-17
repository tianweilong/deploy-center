# Webhook 协议

## 目标

未来的服务器侧代理会接收 webhook 刷新事件，拉取 `deploy-center`，并根据仓库中约定的服务配置执行部署对齐。

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
3. 加载与目标服务匹配的配置输入。
4. 拉取目标镜像标签。
5. 对齐 Docker Compose 服务状态。
6. 记录本地部署结果。
