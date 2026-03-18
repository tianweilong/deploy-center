# 移除旧版 npm 发布入口设计

## 背景

当前 npm 发布链路已经拆分为：

- `scripts/npm-release-common.sh`
- `scripts/prepare-npm-publish-input.sh`
- `scripts/build-npm-release-assets.sh`
- `scripts/publish-npm-package.sh`

但仓库里仍保留 `scripts/release-npm-package.sh` 这一旧入口。它内联了一整份历史逻辑，与新链路重复维护。最近 Windows npm 空包回归已经证明：只要双份实现并存，修复很容易只落到其中一条路径，最终再次漂移。

## 目标

- 彻底删除 `scripts/release-npm-package.sh`
- 所有校验、测试、文档、工作流说明只保留新 npm 发布结构
- 不改变现有 workflow 的输入协议、环境变量名和发布行为

## 方案对比

### 方案 A：保留旧脚本为薄兼容壳

- `scripts/release-npm-package.sh` 只做分发，转调新脚本

优点：

- 对历史调用更温和

缺点：

- 旧入口仍存在，未来仍可能被测试、文档或人工调用继续依赖
- 无法真正消除“双份入口”的认知负担

### 方案 B：彻底删除旧脚本，只保留新结构

- 删除 `scripts/release-npm-package.sh`
- 更新所有测试、文档、语法校验和说明，统一使用新结构

优点：

- 结构最清晰
- 不再存在旧入口漂移风险
- 后续维护面最小

缺点：

- 需要同步更新所有残留引用

### 方案 C：进一步重构为单一主入口加子命令

- 新增 `scripts/npm-release.sh {prepare,build,publish}`

优点：

- 入口更统一

缺点：

- 本轮改动面过大
- 需要额外迁移工作，不是解决当前问题的最小彻底方案

## 结论

采用方案 B。

原因：

- 用户明确要求做彻底改造，而不是继续打补丁
- 现有三段式脚本已经稳定承担职责，不需要再套一层新总入口
- 删除旧脚本可以直接消除近期回归暴露出的根因

## 设计

### 1. 脚本边界

- `scripts/npm-release-common.sh`：公共上下文、版本与路径解析
- `scripts/prepare-npm-publish-input.sh`：准备轻量 npm 包发布输入
- `scripts/build-npm-release-assets.sh`：生成平台 Release 资产与 checksum
- `scripts/publish-npm-package.sh`：消费发布输入并执行 Trusted Publishing

删除：

- `scripts/release-npm-package.sh`

### 2. 测试边界

测试不再把旧脚本视为“兼容入口”，而是直接约束新结构：

- `tests/npm-release-workflow.sh`
  - 断言 workflow 不再引用旧脚本
  - 断言新三段脚本存在且被使用
- `tests/release-npm-package-artifact-path.sh`
  - 直接运行 `scripts/build-npm-release-assets.sh`
- `tests/release-workflow.sh`
  - 禁止 workflow 中残留旧脚本引用

### 3. 文档边界

- `docs/developer-guide.md` 不再描述旧脚本为兼容入口
- 本地校验命令不再包含 `bash -n scripts/release-npm-package.sh`
- 工作流语法校验也不再检查被删除的旧脚本

## 风险与控制

### 风险 1：隐藏引用未清理

控制：

- 全仓搜索 `release-npm-package.sh`
- 把测试与文档同时更新

### 风险 2：删除旧脚本后本地校验脚本失效

控制：

- 更新 `.github/workflows/validate-deployment-config.yml`
- 运行相关 shell 回归测试与语法检查

## 验证策略

- `bash tests/npm-release-workflow.sh`
- `bash tests/release-workflow.sh`
- `bash tests/release-npm-package-artifact-path.sh`
- `bash -n scripts/npm-release-common.sh`
- `bash -n scripts/prepare-npm-publish-input.sh`
- `bash -n scripts/build-npm-release-assets.sh`
- `bash -n scripts/publish-npm-package.sh`
