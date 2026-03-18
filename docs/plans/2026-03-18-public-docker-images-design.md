# 公共 Docker 镜像仓库接入 deploy-center 设计

## 背景

当前 `deploy-center` 的 [`release-service.yml`](/var/folders/qf/rqhtjpgj4rqcgzvcktbyskch0000gn/T/vibe-kanban-dev/worktrees/d2db-docker/deploy-center/.github/workflows/release-service.yml) 主要面向“源仓库显式触发发布，`deploy-center` 负责统一构建并推送到 GHCR”的模式。现有实现已经具备：

- 从源仓库检出指定提交
- 根据 `config/services.<源仓库名>.json` 生成镜像构建矩阵
- 使用 `docker/build-push-action` 推送到 `ghcr.io`

但它目前更偏向“少量固定服务”的场景，`release_targets` 在 workflow 中被写成固定枚举，和一个“集中维护多个公开基础镜像 Dockerfile”的新仓库模型不完全匹配。

新仓库的目标更简单：

- 在单个仓库中维护多个公开镜像目录，例如 `images/redis6`、`images/redis7`
- 每个目录对应一个镜像
- 每个镜像只保留 `latest` 标签
- 监听 `main` 分支提交
- 哪些目录发生变化，就只触发哪些目录的构建
- 支持一次提交同时构建多个目录

## 目标

- 为新的公共基础镜像仓库提供最小可行的目录结构。
- 让该仓库可以顺利接入 `deploy-center` 现有的发布链路。
- 尽量少改 `deploy-center`，优先复用现有 `config/services.<repo>.json` + 矩阵构建机制。
- 保持 `ghcr.io` 统一托管，使后续部署机只需一次 `docker login ghcr.io`。

## 非目标

- 不实现按 Git tag 版本化发布。
- 不为每个镜像生成语义化版本标签。
- 不在第一阶段支持目录自动扫描并动态推导镜像配置。
- 不改变现有环境变量名、JSON 键名、工作流命令名和镜像仓库命名规则。

## 方案对比

### 方案一：继续使用固定枚举 `release_targets`

做法：

- 在 `release-service.yml` 里把 `redis6`、`redis7`、`nginx`、`postgres17` 之类的目录名都写进 `case` 分支。

优点：

- 改动直观
- 行为容易追踪

缺点：

- 每增加一个镜像目录都要修改 workflow
- 目录数量增加后维护成本会迅速上升
- 与“镜像目录由仓库维护者自由扩展”的目标冲突

### 方案二：源仓库负责变更检测，deploy-center 接收目录名列表并按配置构建

做法：

- 源仓库监听 `main` 分支提交
- 源仓库 workflow 对比变更文件，识别出哪些 `images/<dir>` 目录发生变化
- 源仓库把目录名列表作为 `release_targets` 传给 `deploy-center`
- `deploy-center` 通过 `config/services.<repo>.json` 把目录名映射为构建矩阵

优点：

- 贴合当前 `deploy-center` 的职责边界
- `deploy-center` 不需要知道 Git diff 细节
- 新增镜像目录时主要改源仓库目录和 deploy-center 配置，不需要频繁改发布主逻辑
- 易于支持一次提交触发多个目录并行构建

缺点：

- 需要对 `release-service.yml` 的 `release_targets` 解析逻辑做一次收敛改造
- 源仓库需要自带一个很薄的“变更识别 + 触发 dispatch” workflow

### 方案三：deploy-center 检出源仓库后自行扫描变更目录

做法：

- `deploy-center` 在 workflow 内计算源仓库本次提交与上次提交的差异
- 从中识别出变更的镜像目录并动态生成矩阵

优点：

- 源仓库最轻

缺点：

- `deploy-center` 会开始承担源码仓库差异分析逻辑，职责变重
- `repository_dispatch` 的输入语义变得不明确
- 调试难度和回归测试复杂度都更高

## 选型

采用 **方案二：源仓库负责变更检测，deploy-center 接收目录名列表并按配置构建**。

理由：

- 最符合当前 `deploy-center` 的职责定位：源仓库负责触发，`deploy-center` 负责正式发布。
- 目录变更识别属于源仓库上下文，更适合在源仓库本地完成。
- 构建矩阵、GHCR 登录、多架构构建、镜像推送这些能力在 `deploy-center` 中已经成熟。
- 能把这次接入收敛为“新增一种更通用的 `release_targets` 解释方式”，而不是重写整套发布链路。

## 仓库结构设计

新仓库建议使用下面的最小目录结构：

```text
docker-images/
  README.md
  .github/
    workflows/
      release.yml
  images/
    redis6/
      Dockerfile
      .dockerignore
    redis7/
      Dockerfile
      .dockerignore
    nginx/
      Dockerfile
      .dockerignore
```

约束如下：

- `images/<目录名>/Dockerfile` 是每个镜像唯一的构建入口。
- `<目录名>` 直接作为发布目标名，例如 `redis6`、`redis7`。
- 一个目录只对应一个镜像仓库地址。
- 第一阶段每个目录只推送一个固定标签：`latest`。
- 某个目录下如果需要额外文件，例如 entrypoint、patch、conf，都与 Dockerfile 放在同一目录中。

## 发布模型设计

### 1. 变更检测

源仓库在 `main` 分支 push 时执行：

- 对比本次提交范围内的变更文件
- 识别所有匹配 `images/<dir>/...` 的目录
- 去重后得到目录列表，例如 `redis6,redis7`

若没有任何 `images/` 下的目录变化，则不触发 `deploy-center`。

### 2. deploy-center 输入

沿用现有输入：

- `source_repository`
- `source_ref`
- `source_sha`
- `source_tag`
- `release_targets`

其中：

- `source_repository` 指向新的公共镜像仓库
- `source_ref` / `source_sha` 指向本次 `main` 提交
- `release_targets` 直接传目录名列表，例如 `redis6,redis7`
- `source_tag` 在本方案下不再承担版本含义，只作为必填兼容字段传固定值，例如 `latest`

### 3. 镜像标签策略

每个目录构建出的镜像都只推送：

- `latest`

这意味着 `deploy-center` 需要支持“对这类仓库关闭当前的 `SOURCE_TAG` / `latest` 双分支逻辑”，统一只输出 `latest`。

建议做法：

- 在 `config/services.<repo>.json` 中为此类仓库增加一个显式字段，例如 `tags: ["latest"]` 或等价开关
- `release-service.yml` 读取矩阵中的 tag 配置，直接使用配置值推送，而不是从 Git tag 推导

第一阶段如果不想动配置格式，也可以先约定：

- 由源仓库始终把 `source_tag` 传为 `latest`
- `release-service.yml` 继续按当前逻辑发布 `${SOURCE_TAG}`

这样可以用最小改动先跑通，但会保留一些“语义上不够干净”的兼容痕迹。长期更推荐把 tag 规则显式写进服务配置。

## deploy-center 设计

### 1. 配置文件

新增：

- `config/services.<新仓库名>.json`

示例：

```json
{
  "project": "docker-images",
  "services": [
    {
      "service": "redis6",
      "image_repository": "ghcr.io/tianweilong/redis6",
      "context": "source/images/redis6",
      "dockerfile": "Dockerfile",
      "build_args": []
    },
    {
      "service": "redis7",
      "image_repository": "ghcr.io/tianweilong/redis7",
      "context": "source/images/redis7",
      "dockerfile": "Dockerfile",
      "build_args": []
    }
  ]
}
```

设计约束：

- `service` 与目录名保持一致
- `context` 直接指向 `source/images/<dir>`
- `dockerfile` 固定为该目录下的 `Dockerfile`
- 如无特殊需要，`build_args` 为空数组

### 2. release_targets 解析

当前 `release-service.yml` 里，`release_targets` 采用固定枚举方式。

新方案建议调整为：

- `npm` 仍然保留特殊语义
- 除 `npm` 之外的其他目标，一律按 service 名对待
- 是否支持由 `scripts/prepare-release-matrix.rb` 基于 `config/services.<repo>.json` 校验

这样：

- 旧的 `remote`、`relay`、`new-api` 仍然可以作为 service 名继续存在
- 新仓库中的 `redis6`、`redis7` 也能直接复用同一套逻辑

### 3. 构建矩阵

`scripts/prepare-release-matrix.rb` 的主体逻辑可以基本保留，因为它已经支持：

- 读取 `config/services.<repo>.json`
- 根据 `TARGET_SERVICES` 组装矩阵
- 透传 `context`、`dockerfile`、`image_repository`

如果要支持“固定 `latest` 标签”，则建议在矩阵项中补充 tag 或 tags 字段，把标签决策从 workflow 中移到配置与矩阵生成阶段。

## 源仓库 workflow 设计

源仓库只需要一个很薄的 workflow：

1. 监听 `main` push
2. 计算变更的 `images/<dir>` 目录
3. 若为空则退出
4. 通过 `repository_dispatch` 或 `workflow_dispatch` 触发 `deploy-center`

它不负责：

- 本地构建镜像
- 登录 GHCR
- 推送镜像

这些动作全部继续交给 `deploy-center`。

## 错误处理

- 若 `release_targets` 中出现不存在的目录名，`deploy-center` 应在矩阵生成阶段明确失败，并输出“不支持的服务”。
- 若目录存在但缺少 `Dockerfile`，应在构建阶段失败。
- 若某个镜像目录不希望自动发布，应通过不加入 `config/services.<repo>.json` 来显式禁用。

## 测试策略

### deploy-center

- 为新仓库增加一份 `config/services.<repo>.json` 样例配置
- 扩展 `tests/prepare-release-matrix.sh`，验证 `redis6,redis7` 这类目录名可以正确映射为矩阵
- 扩展 `tests/release-workflow.sh`，验证 `release_targets` 的解析逻辑不再依赖固定枚举

### 源仓库

- 增加一个变更识别脚本或 workflow step
- 覆盖：
  - 只改 `images/redis6/**` 时只触发 `redis6`
  - 同时改 `images/redis6/**` 和 `images/redis7/**` 时同时触发两个目标
  - 不涉及 `images/` 时不触发

## 不做事项

- 不做镜像版本标签管理
- 不做自动同步上游官方 tag
- 不做“扫描整个仓库目录自动发现服务配置”
- 不把所有镜像统一推到同一个仓库路径下再靠 tag 区分镜像种类

## 最终建议

最小可行版本应优先保证三件事：

1. 新仓库使用 `images/<目录名>/Dockerfile` 结构。
2. 源仓库自己识别变更目录，并把目录名列表传给 `deploy-center`。
3. `deploy-center` 把 `release_targets` 从固定枚举收敛为“`npm` + 任意 service 名”模式。

这样可以最小成本接入现有发布流程，也为后续继续添加 `mysql8`、`postgres17`、`alpine-base` 这类目录留下清晰扩展路径。
