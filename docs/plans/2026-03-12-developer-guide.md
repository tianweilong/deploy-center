# Developer Guide Documentation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 产出一份适合仓库维护者和新接手开发者阅读的中文指南文档，帮助他们理解 `deploy-center` 的目录结构、发布流程、环境状态模型与日常维护方式。

**Architecture:** 指南文档以“仓库定位 -> 目录职责 -> 发布链路 -> 环境模型 -> 本地验证 -> 常见变更场景”的顺序组织，直接对应仓库现有文件和工作流。文档落在 `docs/` 目录，作为现有 `README.md`、`docs/architecture.md` 与 `docs/rollout.md` 的开发者视角补充。

**Tech Stack:** Markdown、GitHub Actions、Shell、Ruby、YAML、Docker Compose、GHCR

---

### Task 1: 盘点仓库材料并确认文档落点

**Files:**
- Read: `README.md`
- Read: `docs/architecture.md`
- Read: `docs/rollout.md`
- Read: `.github/workflows/release-service.yml`
- Read: `.github/workflows/validate-deployment-config.yml`
- Read: `services/registry.yaml`
- Read: `config/services.vibe-kanban.json`
- Read: `scripts/update-deployment-state.sh`
- Read: `scripts/prepare-release-matrix.rb`
- Read: `tests/release-workflow.sh`
- Read: `tests/prepare-release-matrix.sh`
- Read: `tests/update-deployment-state.sh`
- Read: `tests/ghcr-references.sh`
- Read: `environments/dev/vibe-kanban-remote/deployment.yaml`
- Read: `environments/dev/vibe-kanban-relay/deployment.yaml`
- Read: `environments/prod/vibe-kanban-remote/deployment.yaml`
- Read: `environments/prod/vibe-kanban-relay/deployment.yaml`
- Create: `docs/developer-guide.md`

**Step 1: 盘点已跟踪文件**

Run: `git ls-files`
Expected: 输出所有受版本管理的文件，覆盖工作流、脚本、配置、环境描述与测试。

**Step 2: 阅读核心入口文档与流程文件**

Run: `sed -n '1,220p' README.md docs/architecture.md docs/rollout.md .github/workflows/release-service.yml`
Expected: 能识别仓库定位、Secrets、Environment 变量、构建流程与状态回写逻辑。

**Step 3: 阅读脚本、测试与环境描述符**

Run: `sed -n '1,220p' scripts/update-deployment-state.sh scripts/prepare-release-matrix.rb tests/*.sh environments/dev/vibe-kanban-remote/deployment.yaml`
Expected: 能识别 `deployment.yaml` 的关键字段、矩阵生成逻辑与主要回归测试约束。

**Step 4: 确认文档落点**

Decision: 将正式指南放在 `docs/developer-guide.md`，因为它与 `docs/architecture.md`、`docs/rollout.md` 同属长期维护文档。

### Task 2: 编写中文开发者指南

**Files:**
- Create: `docs/developer-guide.md`
- Modify: `README.md`

**Step 1: 设计文档结构**

文档章节固定为：仓库定位、建议阅读顺序、目录结构、核心发布链路、环境模型、关键配置、本地验证、常见变更场景、边界与维护建议。

**Step 2: 编写正文**

要求：

- 主要语言必须为中文。
- 所有关键路径必须使用精确文件名。
- 明确区分 `services/registry.yaml` 与 `config/services.vibe-kanban.json` 的角色。
- 明确指出 `deployment.yaml` 是期望状态来源。
- 解释 `docker-compose.yml` 当前仍是骨架模板而非自动回写对象。

**Step 3: 增加入口链接**

在 `README.md` 中新增一段简短说明，指向 `docs/developer-guide.md`，方便新维护者直接找到开发文档。

### Task 3: 验证文档准确性与可发现性

**Files:**
- Verify: `docs/developer-guide.md`
- Verify: `README.md`

**Step 1: 检查文档是否引用真实存在的路径**

Run: `rg -n "docs/developer-guide.md|services/registry.yaml|config/services.vibe-kanban.json|deployment.yaml" docs/developer-guide.md README.md`
Expected: 所有关键路径都能在文档中找到，且与仓库真实文件名一致。

**Step 2: 检查文档是否以中文为主**

Run: `sed -n '1,260p' docs/developer-guide.md`
Expected: 正文主叙述为中文，仅路径、变量名、命令与标识符保留英文。

**Step 3: 检查 README 入口是否可见**

Run: `sed -n '1,120p' README.md`
Expected: `README.md` 中出现指向 `docs/developer-guide.md` 的说明。

**Step 4: 运行已有回归测试确认文档改动未影响仓库约束**

Run: `bash tests/prepare-release-matrix.sh && bash tests/release-workflow.sh && bash tests/update-deployment-state.sh && bash tests/ghcr-references.sh`
Expected: 全部命令退出码为 `0`。
