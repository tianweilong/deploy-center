# tests 统一为 Node.js ESM 设计

## 背景

当前仓库已经完成 `scripts/` 目录的统一，生产脚本只保留 `Node.js ESM (.mjs)`。但 `tests/` 目录仍以 shell 脚本为主，且部分测试内部仍依赖 Ruby 解析 JSON。

现状主要问题：

- `tests/*.sh` 仍依赖 `bash`
- `tests/prepare-release-matrix*.sh` 仍依赖 `ruby -rjson -e`
- 测试层与生产脚本层的运行时不一致
- Windows 下测试执行体验仍不统一

如果仓库目标是“脚本与测试都跨平台、单运行时”，测试层也必须统一到 Node.js。

## 目标

- `tests/` 下现有 `.sh` 测试全部迁移为 `.mjs`
- 删除测试中的 `ruby -rjson -e` 断言
- 所有回归测试统一通过 `node --test` 或 `node <test-file>.mjs` 运行
- 保持现有测试覆盖范围、断言语义和工作流契约不变

## 非目标

- 不重写测试意图或缩减覆盖面
- 不修改生产脚本、环境变量名、协议字段名
- 不引入额外测试框架，优先使用 Node 原生能力

## 方案对比

### 方案 A：全部迁移为 Node ESM 独立测试文件

- 每个 `tests/*.sh` 对应迁移为 `tests/*.mjs`
- 文本断言、临时目录、子进程调用全部改为 Node 原生 API

优点：

- 运行时完全统一
- 跨平台最好
- 后续维护成本最低

缺点：

- 一次性改动面较大

### 方案 B：保留 shell 包装，只把 Ruby 断言迁到 Node

- 保留 `.sh`
- 只去掉 Ruby

优点：

- 改动更小

缺点：

- 仍然依赖 bash
- 没有真正解决测试层运行时不统一

### 方案 C：合并成少量 Node 测试文件

- 将多个 shell 测试合并成一个大测试套件

优点：

- 文件数更少

缺点：

- 可读性下降
- 回归定位变差

## 结论

采用方案 A。

原因：

- 用户已明确希望继续统一测试层
- 当前生产脚本已经全部是 `.mjs`
- 保留 shell 只会留下第二套运行时

## 设计

### 1. 文件布局

迁移后建议保留如下测试文件：

- `tests/ghcr-references.mjs`
- `tests/localization-language.mjs`
- `tests/merge-release-checksums.mjs`
- `tests/npm-release-workflow.mjs`
- `tests/npm-release-zip-validation.mjs`
- `tests/prepare-release-matrix.mjs`
- `tests/prepare-release-matrix-new-api.mjs`
- `tests/release-npm-package-artifact-path.mjs`
- `tests/release-workflow.mjs`
- 现有 `tests/test-*.mjs` 单测继续保留

### 2. 测试实现方式

- 文本断言：用 `fs.readFile` + `assert.match` / `assert.doesNotMatch`
- 临时目录：用 `fs.mkdtemp`
- 子进程：用 `spawnSync` / `execFileSync`
- JSON 结果断言：直接 `JSON.parse` + `assert.deepEqual`
- 文件存在性：用 `fs.access` / `fs.stat`

### 3. 测试运行方式

分两类：

- 纯断言/脚本型测试：可直接 `node tests/<name>.mjs`
- 原生测试 API 测试：继续用 `node --test`

如果需要进一步统一入口，可后续再增加聚合 runner，但本轮不是必须。

### 4. 迁移顺序

建议从最容易的开始：

1. `prepare-release-matrix*.sh`
2. `merge-release-checksums.sh`
3. `ghcr-references.sh`
4. `localization-language.sh`
5. `npm-release-zip-validation.sh`
6. `release-npm-package-artifact-path.sh`
7. `release-workflow.sh`
8. `npm-release-workflow.sh`

### 5. 风险与控制

风险：

- shell 文本断言迁到 Node 时行为偏差
- 正则和 grep 语义迁移不一致
- 临时目录与文件路径处理出现平台差异

控制：

- 逐文件迁移，保持原断言语义一一对应
- 优先复用 Node 标准库
- 每迁一个测试就立即运行验证

## 验收标准

- `tests/` 下不再存在 `.sh`
- 测试中不再出现 `ruby -rjson -e`
- 现有关键测试都能用 Node 跑通
- 生产脚本与测试脚本统一为 Node.js ESM

