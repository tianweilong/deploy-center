# update-state 并发推送重试设计

## 背景

`release-service.yml` 的 `update-state` job 当前在 `actions/checkout@v6` 检出的工作树上直接更新 `environments/*/deployment.yaml`、提交并执行 `git push`。

当两个发布流程接近同时运行时，后启动或后完成的流程可能在旧的本地 `main` 基础上创建提交。此时远端 `main` 已被另一条流程推进，当前 job 的 `git push` 会因为非 fast-forward 被拒绝，导致整个发布流程在部署状态回写阶段失败。

## 问题定义

目标不是“让 push 多试几次”这么简单，而是保证每一次重试都基于最新 `origin/main` 重新计算部署状态，避免把旧 checkout 上生成的状态强行 rebase 到新历史上。

## 备选方案

### 方案 A：重试时基于最新远端重新生成部署状态（采用）

流程：

1. `git fetch origin main`
2. `git reset --hard origin/main`
3. 重新根据 `RELEASE_MATRIX` 执行部署状态写入
4. 若无变更则直接成功退出
5. 若有变更则提交并 `git push origin HEAD:main`
6. 若 push 因并发更新失败，则重复整个流程，直到达到重试上限

优点：

- 每次提交都代表“基于当下最新主分支重新计算后的状态”
- 可以正确处理多个发布流程同时修改同一服务或不同服务状态文件
- 逻辑适合抽成可独立测试的 shell 脚本

代价：

- 需要新增脚本并补充集成测试
- 工作流调用方式会略有调整

### 方案 B：push 失败后 pull --rebase 再推

优点：改动最小。

缺点：本地提交内容仍来自旧 checkout 计算结果。即使 rebase 成功，也不保证部署状态反映最新主分支事实，尤其当远端新提交也改动相同部署文件时。

### 方案 C：状态写入迁移到外部服务或队列

优点：从架构上解决并发写主分支的问题。

缺点：远超当前 bugfix 范围，需要额外基础设施和交付链路调整。

## 决策

采用方案 A，并把“基于最新远端重算 + 有限重试提交”的逻辑抽到独立脚本中，避免继续把复杂控制流内联在 GitHub Actions YAML 里。

## 设计

### 新增脚本

新增 `scripts/commit-deployment-state-with-retry.sh`，职责如下：

- 配置 GitHub Actions 使用的提交身份
- 读取 `RELEASE_MATRIX`，逐项调用 `scripts/update-deployment-state.sh`
- 在每次尝试开始前同步 `origin/main`
- 只在 `git push` 失败时重试
- 达到上限后显式失败
- 输出清晰日志，标明第几次尝试、是否检测到变更、是否因为并发推送进入重试

建议默认最大重试次数为 3，可通过环境变量覆盖，默认远端分支为 `main`。

### 工作流改动

`release-service.yml` 的 `update-state` job 调整为：

- 保留 `actions/checkout@v6`
- 不再分成“更新部署状态文件”和“提交部署状态变更”两段内联 shell
- 直接调用 `./scripts/commit-deployment-state-with-retry.sh`
- 通过 `env` 向脚本传入 `RELEASE_MATRIX`、`SOURCE_REF`、`SOURCE_SHA`、`SOURCE_TAG`

### 错误处理

- `git fetch`、Ruby 解析矩阵、状态写入、`git commit` 任一步失败，都立即失败，不做静默吞错
- 只有 `git push` 非零退出时进入下一次尝试
- 若重算后没有 diff，输出“没有可提交的部署状态变更”，并成功退出
- 若达到重试上限仍无法 push，输出明确错误并返回非零退出码

### 可测试性

把逻辑放进脚本后，可以使用临时 bare repo 和两个 clone 在本地稳定复现：

1. 第一个 clone 准备部署状态更新，但尚未推送
2. 第二个 clone 先向远端提交一笔变更，制造并发推进
3. 第一个 clone 执行重试脚本，验证它会获取最新远端、重算文件并最终成功推送

## 测试策略

### 新增行为测试

新增 `tests/commit-deployment-state-with-retry.sh`：

- 构造 bare repo 作为远端
- 创建初始 `main`
- 在 runner clone 中执行脚本
- 通过 hook 或辅助提交制造第一次 push 冲突
- 验证脚本最终成功，且远端 `deployment.yaml` 内容为预期值

### 调整静态测试

更新 `tests/release-workflow.sh`，确认：

- 工作流仍保留 `update-state` job
- 工作流改为调用 `./scripts/commit-deployment-state-with-retry.sh`
- 不再直接包含裸 `git push`

## 影响范围

- `deploy-center/.github/workflows/release-service.yml`
- `deploy-center/scripts/commit-deployment-state-with-retry.sh`
- `deploy-center/tests/commit-deployment-state-with-retry.sh`
- `deploy-center/tests/release-workflow.sh`
- 可选：`deploy-center/docs/developer-guide.md`

## 不做的事

- 不改变 `scripts/update-deployment-state.sh` 的字段写入语义
- 不调整发布矩阵结构
- 不引入新的 GitHub Secrets / Variables
- 不把状态回写改成异步系统或外部数据库
