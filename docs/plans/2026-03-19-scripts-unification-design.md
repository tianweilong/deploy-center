# scripts 统一为 Node.js ESM 设计

## 背景

当前 `scripts/` 目录同时存在三类脚本：

- `*.rb`
- `*.sh`
- `*.mjs`

这些脚本共同服务于发布与部署链路，但依赖的运行时和平台能力并不一致：

- `scripts/prepare-release-matrix.rb` 使用 Ruby 生成 GitHub Actions matrix
- `scripts/release-meta.mjs`、`scripts/validate-npm-build-contract.mjs` 使用 Node.js 处理协议与校验
- `scripts/npm-release-common.sh`、`scripts/prepare-npm-publish-input.sh`、`scripts/build-npm-release-assets.sh`、`scripts/publish-npm-package.sh`、`scripts/merge-release-checksums.sh` 使用 Bash 编排流程与文件操作

现状有两个直接问题：

1. 脚本主运行时不统一，仓库需要同时理解 Ruby、Bash、Node.js 三套实现方式。
2. Bash 脚本天然偏向 Unix 语义，跨平台尤其是 Windows 原生执行体验差，且容易继续引入 `cp`、`find`、`tar`、`source`、process substitution 等平台差异。

用户已经明确本次不考虑历史兼容，接受统一以 Node.js 为脚本运行前提，并要求一次性完成现有脚本的全量迁移。

## 目标

- `scripts/` 下彻底只保留 `Node.js ESM (.mjs)` 脚本
- 删除所有现存 `.sh` 与 `.rb`
- GitHub Actions、测试、开发文档统一通过 `node scripts/*.mjs` 调用脚本
- 不修改环境变量名、API 字段名、JSON/YAML 键名、协议字段名、镜像仓库名、仓库路径和命令名
- 不改变现有产物命名、发布行为、输入输出 JSON 结构和 workflow 契约

## 非目标

- 不把多个脚本再合并成新的“大一统总入口”
- 不修改发布流程本身的业务含义
- 不新增历史兼容壳或保留旧文件名入口
- 不改变 `npm` / `pnpm` 作为业务工具链依赖的事实

## 方案对比

### 方案 A：全部迁移到 Node.js ESM，保留职责拆分

- 所有脚本迁移为 `.mjs`
- 保持当前按职责拆分的结构
- workflow、测试、文档同步切换到 Node 入口

优点：

- 运行时统一
- 跨平台最清晰
- 后续规范简单，不再为脚本类型做额外判断
- 便于模块化复用与 Node 测试覆盖

缺点：

- 本次改动面最大

### 方案 B：保留多语言，只补一层规范

- 约束未来脚本优先 Node
- 存量 `.sh`、`.rb` 暂不迁移

优点：

- 改动较小

缺点：

- 无法解决当前存量不统一问题
- 未来仍需长期维护多套运行时
- 与用户“一次性迁移完”的要求不符

### 方案 C：合并成一个 Node 主入口加子命令

- 新增单一脚本，例如 `scripts/release-tools.mjs`
- 以子命令承载 matrix、publish、build、merge 等能力

优点：

- 入口表面更统一

缺点：

- 职责耦合增加
- 现有测试与 workflow 可读性变差
- 本轮不是必要复杂度

## 结论

采用方案 A：全部迁移到 Node.js ESM，并保留现有职责拆分。

原因：

- 用户明确要求本次一次性迁移完成，不考虑历史兼容
- 当前仓库在 npm 发布链路中本就依赖 Node.js，作为脚本唯一运行时最合理
- 继续保留 Bash 和 Ruby 只会维持维护成本和平台差异

## 迁移后结构

迁移完成后，`scripts/` 应只保留以下文件：

- `scripts/prepare-release-matrix.mjs`
- `scripts/npm-release-common.mjs`
- `scripts/prepare-npm-publish-input.mjs`
- `scripts/build-npm-release-assets.mjs`
- `scripts/publish-npm-package.mjs`
- `scripts/merge-release-checksums.mjs`
- `scripts/release-meta.mjs`
- `scripts/validate-npm-build-contract.mjs`

对应关系如下：

- `scripts/prepare-release-matrix.rb` -> `scripts/prepare-release-matrix.mjs`
- `scripts/npm-release-common.sh` -> `scripts/npm-release-common.mjs`
- `scripts/prepare-npm-publish-input.sh` -> `scripts/prepare-npm-publish-input.mjs`
- `scripts/build-npm-release-assets.sh` -> `scripts/build-npm-release-assets.mjs`
- `scripts/publish-npm-package.sh` -> `scripts/publish-npm-package.mjs`
- `scripts/merge-release-checksums.sh` -> `scripts/merge-release-checksums.mjs`
- `scripts/release-meta.mjs`、`scripts/validate-npm-build-contract.mjs` 保留并按新公共模块能力做适配

## 设计

### 1. 脚本边界

#### `scripts/prepare-release-matrix.mjs`

职责：

- 读取服务配置 JSON
- 解析 `TARGET_SERVICES`
- 校验构建参数环境变量
- 应用 `DEFAULT_IMAGE_PLATFORMS`
- 输出 GitHub Actions matrix JSON

要求：

- 保持与旧版 Ruby 脚本相同的输入环境变量和输出结构
- 保持错误语义与现有测试约束一致

#### `scripts/npm-release-common.mjs`

职责：

- 路径解析
- 平台目录映射
- 版本策略解析
- release 元数据 payload 构造
- 文件复制与目录准备
- 归档打包
- checksum 生成
- 外部命令执行封装

要求：

- 替代 Bash 中通过 `source` 共享函数的方式
- 对外以命名导出提供复用函数
- 尽量把原先隐式依赖系统命令的逻辑收拢到显式 API

#### `scripts/prepare-npm-publish-input.mjs`

职责：

- 初始化 npm 发布上下文
- 执行 `pnpm i --frozen-lockfile`
- 执行 `pnpm run build:npx`
- 复制 package 内容
- 写入 `release-meta.json`
- 写入 `publish-context.json`
- 写入 `manifest.txt`

要求：

- 输出目录结构保持不变
- 清单内容与下游发布脚本契约保持不变

#### `scripts/build-npm-release-assets.mjs`

职责：

- 初始化 npm 发布上下文
- 执行构建命令
- 校验平台构建契约
- 根据 manifest 复制平台文件
- 打包平台 release 资产
- 生成 checksum 文件

要求：

- 保持平台目录映射、资产命名和 checksum 命名不变
- 不再依赖 `tar`、`cp`、`rm -rf` 或 `powershell.exe`

#### `scripts/publish-npm-package.mjs`

职责：

- 校验发布输入目录与 manifest
- 调整 `package.json` 版本
- 执行 `npm pack`
- 通过 `npm view` 判断是否已发布
- 执行 `npm publish`

要求：

- 保持“版本已存在则跳过发布”的幂等行为
- 输出文案与错误边界保持清晰

#### `scripts/merge-release-checksums.mjs`

职责：

- 递归扫描 checksum 文件
- 校验 checksum 文件名一致性
- 合并去重
- 清理分散文件

要求：

- 保持最终合并文件位置与命名不变

### 2. 关键技术取舍

统一采用以下实现原则：

- 文件系统操作使用 `node:fs/promises`
- 路径处理使用 `node:path`
- 子进程调用使用 `node:child_process`
- JSON 处理使用原生 `JSON.parse` / `JSON.stringify`
- hash 计算使用 `node:crypto`

同时明确禁止继续依赖以下系统行为作为核心实现：

- `bash`
- `ruby`
- `cp`
- `find`
- `tar`
- `rm -rf`
- `source`
- `powershell.exe`

说明：

- `pnpm` 与 `npm` 仍作为业务工具链保留，由 Node 脚本通过子进程调用
- 这不属于多运行时问题，而是脚本业务职责的一部分

### 3. 压缩格式实现

当前链路需要同时支持：

- `zip`
- `tar.gz`

设计要求：

- 两种格式都通过 Node 实现，不依赖操作系统内置命令
- zip 打包行为需要继续满足已有“至少包含 `manifest.json` 且包含平台文件”的校验约束
- tar.gz 输出格式保持与现有消费方兼容

### 4. 测试边界

测试也应同步统一到 Node，不再把 shell 作为核心验证手段。

测试分层如下：

- 模块单测：
  - `release-meta.mjs`
  - `validate-npm-build-contract.mjs`
  - `npm-release-common.mjs`
  - `prepare-release-matrix.mjs`
- CLI/流程测试：
  - `prepare-npm-publish-input.mjs`
  - `build-npm-release-assets.mjs`
  - `publish-npm-package.mjs`
  - `merge-release-checksums.mjs`
- workflow 文本约束测试：
  - 断言 workflow 已改为 `node scripts/*.mjs`

现有 `.sh` 测试若只是验证文本引用或脚本行为，应迁移为 `.mjs`；不再让核心回归依赖 shell。

### 5. 文档与 workflow 边界

需要同步更新：

- `.github/workflows/release-service.yml`
- `.github/workflows/validate-deployment-config.yml`
- `docs/developer-guide.md`
- `docs/plans` 中后续新增引用

更新原则：

- 文档示例命令全部改为 `node scripts/*.mjs`
- workflow 中不再出现 `bash` / `ruby` 对这些脚本的调用
- 若有语法校验步骤，应改为实际 Node 可执行校验方式，而不是 `bash -n` / `ruby -c`

## 风险与控制

### 风险 1：一次性迁移改动面大，容易遗漏引用

控制：

- 全仓搜索旧脚本名
- 测试、workflow、文档统一在同一轮中清理

### 风险 2：shell 隐式行为迁入 Node 时语义偏差

控制：

- 先补足关键回归测试，再实施迁移
- 对清单、产物命名、目录结构、错误提示做定向断言

### 风险 3：压缩实现切换导致 Windows 与 Unix 结果不一致

控制：

- 对 zip 和 tar.gz 增加专门的产物校验测试
- 使用 Node 内部统一实现，避免平台分支

## 验收标准

- `scripts/` 下不再存在 `.sh`、`.rb`
- workflow 不再调用 Bash 或 Ruby 版脚本入口
- 所有现有脚本能力都可通过 `node scripts/*.mjs` 完成
- 环境变量、JSON 结构、产物命名、发布行为保持不变
- 核心测试通过，且新增测试能覆盖主要回归点

