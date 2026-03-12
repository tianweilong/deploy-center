# 仓库中文化实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `deploy-center` 仓库中的主要自然语言内容统一为中文，并新增长期语言约束文档。

**Architecture:** 先通过测试固化中文化要求，再逐类修改文档、脚本与测试文案，最后用测试与文本扫描验证兼容性。所有机器契约字段、环境变量、镜像名和协议键名保持不变。

**Tech Stack:** Markdown、Bash、Ruby、GitHub Actions YAML、ripgrep

---

### Task 1: 固化仓库语言规则

**Files:**
- Create: `AGENTS.md`
- Test: `tests/localization-language.sh`

**Step 1: Write the failing test**

在 `tests/localization-language.sh` 中加入对根级 `AGENTS.md` 的存在性与“默认中文”关键字检查。

**Step 2: Run test to verify it fails**

Run: `bash tests/localization-language.sh`

Expected: 因缺少 `AGENTS.md` 或缺少中文规范而失败。

**Step 3: Write minimal implementation**

创建 `AGENTS.md`，明确：

- 默认使用中文
- 代码与测试可见文案优先中文
- 外部协议、字段名、第三方约束保留原文

**Step 4: Run test to verify it passes**

Run: `bash tests/localization-language.sh`

Expected: 通过。

### Task 2: 用失败测试锁定文档中文化范围

**Files:**
- Modify: `tests/localization-language.sh`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/rollout.md`
- Modify: `docs/plans/2026-03-11-ghcr-vibe-kanban-design.md`
- Modify: `docs/plans/2026-03-11-ghcr-vibe-kanban-migration.md`
- Modify: `agents/webhook/README.md`
- Modify: `agents/webhook/protocol.md`
- Modify: `environments/dev/vibe-kanban-remote/README.md`
- Modify: `environments/dev/vibe-kanban-relay/README.md`
- Modify: `environments/prod/vibe-kanban-remote/README.md`
- Modify: `environments/prod/vibe-kanban-relay/README.md`

**Step 1: Write the failing test**

在 `tests/localization-language.sh` 中增加关键英文标题与描述的反向检查，例如 `Deploy Center`、`Architecture`、`Rollout Guide`、`Webhook Agent` 等。

**Step 2: Run test to verify it fails**

Run: `bash tests/localization-language.sh`

Expected: 因上述文件仍含旧英文文案而失败。

**Step 3: Write minimal implementation**

逐文件改为中文叙述，保留命令、环境变量名、协议字段名和镜像名原文。

**Step 4: Run test to verify it passes**

Run: `bash tests/localization-language.sh`

Expected: 文档相关检查通过。

### Task 3: 用失败测试锁定脚本与测试文案中文化

**Files:**
- Modify: `tests/prepare-release-matrix.sh`
- Modify: `tests/update-deployment-state.sh`
- Modify: `scripts/prepare-release-matrix.rb`
- Modify: `scripts/update-deployment-state.sh`

**Step 1: Write the failing test**

将测试中对脚本错误信息的期望改为中文，并补充对中文错误信息的断言。

**Step 2: Run test to verify it fails**

Run: `bash tests/prepare-release-matrix.sh && bash tests/update-deployment-state.sh`

Expected: 因脚本仍输出英文错误信息而失败。

**Step 3: Write minimal implementation**

将 Ruby/Bash 脚本中的可见错误信息改为中文，不改环境变量名与路径结构。

**Step 4: Run test to verify it passes**

Run: `bash tests/prepare-release-matrix.sh && bash tests/update-deployment-state.sh`

Expected: 通过。

### Task 4: 中文化工作流可见文案与示例注释

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Modify: `.github/workflows/validate-deployment-config.yml`
- Modify: `environments/dev/vibe-kanban-remote/.env.example`
- Modify: `environments/dev/vibe-kanban-relay/.env.example`
- Modify: `environments/prod/vibe-kanban-remote/.env.example`
- Modify: `environments/prod/vibe-kanban-relay/.env.example`
- Modify: `tests/localization-language.sh`

**Step 1: Write the failing test**

在 `tests/localization-language.sh` 中加入对工作流 `name`、步骤 `name`、示例注释残留英文标题的检查。

**Step 2: Run test to verify it fails**

Run: `bash tests/localization-language.sh`

Expected: 因工作流和示例文件仍存在英文说明而失败。

**Step 3: Write minimal implementation**

将工作流展示名、步骤标题和示例注释改为中文；表达式、键名、路径和命令保持原样。

**Step 4: Run test to verify it passes**

Run: `bash tests/localization-language.sh`

Expected: 通过。

### Task 5: 全量回归与残留扫描

**Files:**
- Modify: `tests/localization-language.sh`

**Step 1: Run targeted tests**

Run: `bash tests/localization-language.sh && for f in tests/*.sh; do bash "$f"; done`

Expected: 全部通过。

**Step 2: Run residual scan**

Run: `rg -n "Deploy Center|Architecture|Rollout Guide|Required repository secrets|Missing required|Unsupported service|Webhook Agent" README.md docs agents scripts tests environments .github`

Expected: 无匹配，或仅保留明确允许的外部原文。

**Step 3: Review diff**

Run: `git diff -- README.md docs agents scripts tests environments .github AGENTS.md`

Expected: 仅包含中文化与规则文档相关改动。
