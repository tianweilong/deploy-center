# 架构说明

`deploy-center` 是一个以环境为先的多服务部署控制仓库。

- 应用仓库负责运行 CI，并触发发布编排。
- `deploy-center` 负责检出源码、构建镜像、推送到镜像仓库，并记录部署状态。
- `deploy-center` 中的 GitHub Environments 保存各环境特定的发布配置。
- 未来的拉取式代理会把本仓库中的状态同步到目标服务器。
