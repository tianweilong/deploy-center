# npm 分发规范统一设计

## 背景

当前 `myte` 与 `vibe-kanban` 都通过 `deploy-center/.github/workflows/release-service.yml` 发布 npm 包，但实际承载了两类不同分发职责：

- 轻量安装器包：npm 包本身不携带平台 `dist`，运行时按平台从 GitHub Release 下载资产
- 自包含本地包：包内直接携带 `dist`，用于本地自测、离线执行或手工分发

这两类职责目前混在同一套隐式逻辑里，已经暴露出两个具体问题：

- `vibe-kanban` 采用 `base_patch_offset` 后，npm 版本为 `0.1.3018`，但运行时仍从打包后的 `package.json.version` 与仓库字段隐式推导 release tag，导致下载错误的 `vibe-kanban-v0.1.30` 并返回 404
- 本地手工打包场景沿用了“运行时去 GitHub Release 拉 dist”的逻辑，而包内并没有 `dist`，导致本地自用包无法工作

根因不是单点 bug，而是“包的分发模式”和“release 元数据”都依赖运行时隐式推导，没有形成显式、可校验的统一协议。

## 目标

- 统一 `deploy-center`、`myte`、`vibe-kanban` 的 npm 分发协议，不再让 CLI 在运行时自行猜测 release tag、release 仓库和分发模式
- 明确区分两种包形态：
  - `github_release` 轻量安装器包
  - `bundled_dist` 自包含本地包
- 让 `myte` 与 `vibe-kanban` 都消费同一份显式发布元数据文件，而不是各自使用隐式规则
- 保持 `deploy-center` 仍为正式发布中心，同时支持源仓库本地生成可直接使用的自包含包
- 为后续新增 npm CLI 项目提供稳定接入协议

## 非目标

- 本次不把平台资产正式分发方式从 GitHub Release 改成 npm 平台子包或 `optionalDependencies`
- 本次不改动现有服务镜像发布逻辑
- 本次不统一 `myte` 与 `vibe-kanban` 的构建语言或目录结构细节，只统一 npm 分发协议
- 本次不引入新的远端存储介质，正式平台资产继续由 GitHub Release 托管

## 方案对比

### 方案一：单一 npm 包，运行时通过显式元数据切换分发模式

- 正式发布仍是同一个 npm 包名
- `deploy-center` 在发布前写入标准 `release-meta.json`
- 运行时根据 `distributionMode` 决定是走 GitHub Release 还是读取包内 `dist`
- 本地自包含包通过源仓库自己的构建脚本生成，但仍使用同一份元数据协议

优点：

- 用户认知最简单，正式消费路径不变
- `myte` 与 `vibe-kanban` 都能统一到同一套协议
- 本地包与正式发布包共享运行时代码，只切换元数据和打包内容

缺点：

- 源仓库需要显式维护两类打包入口
- CLI 运行时要新增一层元数据解析

### 方案二：仍保留单包，但只靠运行时探测 `dist/` 是否存在

- 有 `dist/` 就走本地包
- 没有 `dist/` 就走 GitHub Release

优点：

- 改动面最小

缺点：

- 依然是隐式协议，后续很容易再次出现“某个目录碰巧存在/不存在”导致的回归
- 无法显式表达 release tag、release 仓库和 npm 版本映射规则

### 方案三：拆成两个 npm 包

- 一个轻量安装器包
- 一个完整自包含包

优点：

- 职责边界最硬

缺点：

- 包维护、文档、版本同步和用户理解成本明显更高
- 目前没有证据表明公开维护两套包名是必要的

## 选型

采用 **方案一：单一 npm 包名 + 显式分发元数据 + 两类打包入口**。

理由：

- 问题核心是协议隐式，不是包名本身不够多
- 同一运行时代码可以同时支持“正式轻量发布”和“本地自包含包”，没有必要先增加第二个公开包名
- 只要把 release 仓库、release tag、包版本、分发模式都写成标准元数据，`base_patch_offset`、`source_tag` 这类差异就不会再由 CLI 猜错

## 核心设计

### 1. 引入标准发布元数据文件

每个 npm CLI 包目录引入标准文件：

- `release-meta.json`

建议字段：

```json
{
  "schemaVersion": 1,
  "packageName": "@vino.tian/vibe-kanban",
  "packageVersion": "0.1.3018",
  "releaseRepository": "tianweilong/deploy-center",
  "releaseTag": "vibe-kanban-v0.1.3018",
  "releasePackageKey": "vibe-kanban",
  "distributionMode": "github_release"
}
```

字段约束：

- `schemaVersion` 首版固定为 `1`
- `packageName` 必须等于当前包的 `package.json.name`
- `packageVersion` 必须等于最终发布到 npm 的版本
- `releaseRepository` 为 GitHub Release 所在仓库，当前规范固定为 `tianweilong/deploy-center`
- `releaseTag` 必须为实际上传资产时创建的 tag，不允许 CLI 再次推导
- `releasePackageKey` 为 release 资产名前缀，默认由 `NPM_PACKAGE_NAME` 推导
- `distributionMode` 仅允许：
  - `github_release`
  - `bundled_dist`

### 2. 统一两类包形态

#### 正式轻量安装器包

特征：

- npm 正式发布产物
- 不携带 `dist/`
- `distributionMode=github_release`
- 运行时从 `release-meta.json` 读取 release 仓库与 release tag，再下载当前平台资产

适用场景：

- `npm install -g`
- `npx @vino.tian/...`
- 正式对外分发

#### 本地自包含包

特征：

- 由源仓库本地命令单独生成
- 包内直接包含 `dist/<platform>/` 或本地调试所需目录
- `distributionMode=bundled_dist`
- 运行时不访问 GitHub Release，直接读取包内 `dist`

适用场景：

- 开发者本地手工打包
- 无网环境自测
- 临时分发给少量使用者

### 3. `deploy-center` 的职责

`deploy-center` 继续作为正式发布中心，负责：

- 解析 `npm_version_strategy`
- 计算最终 `PUBLISH_VERSION`
- 由 `NPM_PACKAGE_NAME` 推导 `releasePackageKey`
- 生成标准 `release-meta.json`
- 在 `release-github-release` job 中使用相同 `releaseTag`
- 发布轻量 npm 包

新增约束：

- `releaseTag` 只能由发布脚本生成一次，并同时写入 GitHub Release 创建步骤和 npm 包元数据
- npm 包运行时代码不得再从 `package.json.version`、`repository.url` 等字段二次推导 release 地址

### 4. 源仓库职责

#### vibe-kanban

- `npx-cli` 改为读取 `release-meta.json`
- 删除运行时基于 `package.json.version` 和 `repository.url` 的 release 推导逻辑
- 增加本地自包含打包入口，例如 `pnpm run pack:npx-local`
- 该入口负责：
  - 生成或复用 `dist`
  - 写入 `distributionMode=bundled_dist` 的 `release-meta.json`
  - 产出可直接安装或解包运行的本地包

#### myte

- 安装脚本同样改为读取 `release-meta.json`
- 即使当前版本策略是 `source_tag`，也不再依赖隐式拼接 release tag
- 本地自包含打包入口可以先保持最小实现，但协议层必须与 `vibe-kanban` 一致

### 5. 运行时分发逻辑

CLI 启动时统一执行：

1. 读取 `release-meta.json`
2. 校验 `schemaVersion`
3. 根据 `distributionMode` 分支：
   - `github_release`
     - 使用 `releaseRepository`、`releaseTag`、`releasePackageKey`
     - 生成 checksums 文件名和平台资产名
     - 下载、校验、缓存、解压
   - `bundled_dist`
     - 直接读取包内 `dist`
     - 不发起网络请求

由此可以消除以下隐式推导：

- 从 npm 版本反推 GitHub Release tag
- 从 `package.json.repository` 反推 release 仓库
- 从是否存在某个临时目录反推当前包形态

### 6. 本地打包入口约定

正式发布和本地打包必须拆成两个显式入口：

- `build:npx`
  - 面向发布中心和 CI
  - 输出平台构建产物
  - 不负责生成完整自包含 npm 包
- `pack:npx-local`
  - 面向开发者本地使用
  - 生成带 `dist` 的自包含包
  - 写入 `distributionMode=bundled_dist`

这样可以避免“本地自用”和“正式发布”互相污染：

- 正式发布包不再意外带入 `dist`
- 本地包不再误走 GitHub Release 下载

## 测试策略

### deploy-center

- 增加 `release-meta.json` 生成与字段校验测试
- 增加 `base_patch_offset` 场景测试，锁定：
  - npm 版本
  - release tag
  - 包内元数据
  三者一致
- 更新 workflow / shell 测试，确保 GitHub Release 创建与 npm 发布共用同一 `releaseTag`

### vibe-kanban

- 为 `npx-cli` 增加测试，覆盖：
  - `github_release` 模式下读取元数据并生成 checksums/asset URL
  - `bundled_dist` 模式下不触发网络下载
  - `base_patch_offset` 版本映射时使用显式 `releaseTag` 而非 `package.json.version`
- 增加本地打包 smoke test，验证产物包含 `dist` 与 `release-meta.json`

### myte

- 为安装脚本增加测试，覆盖：
  - `source_tag` 模式下读取显式 `releaseTag`
  - 元数据缺失或非法时给出清晰错误

## 风险与缓解

风险：

- 三个仓库同步修改，回归面较大
- 正式包和本地包如果共用同一路径，容易再次串线
- 旧包仍可能依赖 `package.json.repository`

缓解：

- 先由 `deploy-center` 定义元数据协议和生成逻辑，再让两个源仓库适配
- 用测试锁定“运行时只读 `release-meta.json`”这一条根约束
- 本地包入口使用独立命令名，避免和正式发布流程复用最终打包步骤

## 迁移顺序

1. `deploy-center` 生成标准 `release-meta.json`，并把 `releaseTag` 作为单一事实源
2. `vibe-kanban` 改 runtime 读取元数据，并补本地自包含打包入口
3. `myte` 改安装脚本读取元数据
4. 更新三边文档与发布说明

## 不做事项

- 不在本次引入第二个公开 npm 包名
- 不在本次把平台资产重新迁移回 npm tarball
- 不长期保留“先读元数据，失败再猜版本”的回退逻辑
