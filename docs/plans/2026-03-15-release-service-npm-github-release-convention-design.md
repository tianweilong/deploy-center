# release-service npm GitHub Release 分发约定化设计

## 背景

当前分支已经把 `release-service` 的 npm 发布改造成“GitHub Release 分发平台资产 + 轻量 npm 包发布”的模型，并引入了两个显式输入：

- `npm_release_package_key`
- `npm_release_repository`

这个方案本身可行，但用户进一步明确希望遵循“约定大于配置”：

- GitHub Release 仓库固定使用当前仓库 `deploy-center`
- `package-key` 不再显式传入，而是直接由 `NPM_PACKAGE_NAME` 推导

例如：

- `@vino.tian/vibe-kanban` -> `vibe-kanban`

因此需要在不改变现有 npm 版本策略的前提下，进一步收敛发布协议，减少调用侧配置。

## 目标

- 删除 `npm_release_package_key` 与 `npm_release_repository` 两个 workflow 输入。
- GitHub Release 仓库固定为当前仓库 `github.repository`。
- `package-key` 由 `NPM_PACKAGE_NAME` 自动推导：
  - 若有 scope，取 `/` 后的部分
  - 若无 scope，直接取包名本身
- GitHub Release tag 继续保持：
  - `<derived-package-key>-vX.Y.Z`
- 平台首版仍至少支持：
  - `linux-x64`
  - `win32-x64`
  - `darwin-arm64`

## 方案对比

### 方案一：约定化推导 `package-key` 与 release 仓库

- `package-key` 从 `NPM_PACKAGE_NAME` 推导
- Release 仓库固定为当前仓库
- workflow 只保留真正必要的 npm 输入

优点：

- 调用方最简单，不需要额外传两个参数。
- 发布协议仍然稳定可预测。
- 更符合当前仓库使用场景和“约定大于配置”的方向。

缺点：

- 若未来需要把资产上传到其他仓库，必须重新调整实现。
- 若未来同仓库内出现“去 scope 后同名”的包，约定会冲突。

### 方案二：保留显式输入，调用方自己传

优点：

- 灵活度最高。
- 对未来跨仓库或特殊命名场景更通用。

缺点：

- 调用方负担更重。
- 更容易出现参数缺失或传错。

### 方案三：从源仓库某个配置文件自动读取

优点：

- 调用方不必显式传值。

缺点：

- `deploy-center` 会依赖源仓库内部结构。
- 比当前约定化方案更脆弱，也更难排查。

## 选型

采用 **方案一**。

理由：

- 这是最符合当前业务约束的最小协议。
- `deploy-center` 本身就是 release 资产承载仓库，单独传 `npm_release_repository` 没有实际收益。
- `NPM_PACKAGE_NAME` 已经是必填输入，从中推导 `package-key` 比新增显式参数更稳定、更简洁。

## 设计细节

### Release 仓库

- Release 仓库固定取当前 GitHub Actions 上下文中的 `github.repository`
- 不再通过 workflow 输入或 dispatch payload 传入

### package-key 推导规则

- 若 `NPM_PACKAGE_NAME` 匹配 `@scope/name`，则取 `name`
- 若 `NPM_PACKAGE_NAME` 不带 scope，则直接取包名本身

示例：

- `@vino.tian/vibe-kanban` -> `vibe-kanban`
- `foo` -> `foo`

### Tag 与资产命名

GitHub Release tag 继续使用：

- `<package-key>-vX.Y.Z`

资产命名继续使用：

- `<package-key>-vX.Y.Z-linux-x64.tar.gz`
- `<package-key>-vX.Y.Z-win32-x64.zip`
- `<package-key>-vX.Y.Z-darwin-arm64.tar.gz`
- `<package-key>-vX.Y.Z-checksums.txt`

### Workflow 改动方向

- 删除 `.github/workflows/release-service.yml` 中的：
  - `npm_release_package_key`
  - `npm_release_repository`
- 删除顶层 `env` 中对这两个输入的透传
- 保留 GitHub Release 三阶段结构：
  - `release-npm-assets`
  - `release-github-release`
  - `release-npm`
- `release-github-release` 中 `gh release create` / `gh release upload` 改为默认使用当前仓库

### 脚本改动方向

- `scripts/release-npm-package.sh` 不再依赖：
  - `NPM_RELEASE_PACKAGE_KEY`
  - `NPM_RELEASE_REPOSITORY`
- 脚本内部新增一个从 `NPM_PACKAGE_NAME` 推导 `package-key` 的逻辑
- 由该逻辑统一生成：
  - release tag
  - asset file name
  - checksums file name

### 失败处理

- 若 `NPM_PACKAGE_NAME` 为空，沿用现有必填校验
- 若 `NPM_PACKAGE_NAME` 不是合法 npm 包名，本次不额外引入复杂校验，依赖现有流程和源仓库事实输入
- 若去 scope 后发生名称冲突，视为仓库级命名约束问题，不在首版自动解决

### 测试策略

#### workflow 侧

- 更新 `tests/release-workflow.sh`
  - 断言不再存在 `npm_release_package_key`
  - 断言不再存在 `npm_release_repository`
  - 断言仍存在 GitHub Release 三阶段结构与 `darwin-arm64`

#### 脚本侧

- 更新 `tests/npm-release-workflow.sh`
  - 断言脚本从 `NPM_PACKAGE_NAME` 派生 release 资产命名
  - 断言不再依赖 `NPM_RELEASE_PACKAGE_KEY`
  - 断言不再依赖 `NPM_RELEASE_REPOSITORY`

#### 文档侧

- 更新 `docs/developer-guide.md`
  - 将“显式传 `package-key` / 仓库”的说明改成“按约定推导”

## 影响范围

- 工作流：`.github/workflows/release-service.yml`
- 脚本：`scripts/release-npm-package.sh`
- 测试：`tests/release-workflow.sh`、`tests/npm-release-workflow.sh`
- 文档：`docs/developer-guide.md`

## 不做事项

- 不在本次支持自定义 GitHub Release 仓库。
- 不在本次支持自定义 package-key 推导规则。
- 不解决“不同包去 scope 后同名”的高级冲突场景。
