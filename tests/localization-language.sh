#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f AGENTS.md ]
grep -q '默认使用中文' AGENTS.md
grep -q '代码内可见文案优先中文' AGENTS.md
grep -q '测试相关文案优先中文' AGENTS.md

auto_reject=(
  'README.md:^# Deploy Center$'
  'README.md:Required repository secrets:'
  'docs/architecture.md:^# Architecture$'
  'docs/rollout.md:^# Rollout Guide$'
  'agents/webhook/README.md:^# Webhook Agent$'
  'agents/webhook/protocol.md:^# Webhook Protocol$'
  '.github/workflows/validate-deployment-config.yml:^name: Validate Deployment Config$'
  '.github/workflows/validate-deployment-config.yml:Validate deployment YAML'
  '.github/workflows/validate-deployment-config.yml:Validate helper scripts'
  '.github/workflows/release-service.yml:^name: Release Service$'
  '.github/workflows/release-service.yml:description: Source repository'
  '.github/workflows/release-service.yml:description: Source ref'
  '.github/workflows/release-service.yml:description: Source SHA'
  '.github/workflows/release-service.yml:description: Target environment'
  '.github/workflows/release-service.yml:description: Comma-separated services'
  '.github/workflows/release-service.yml:Validate release inputs'
  '.github/workflows/release-service.yml:Build service matrix'
  '.github/workflows/release-service.yml:Checkout source repository'
  '.github/workflows/release-service.yml:Setup SSH agent for private dependencies'
  '.github/workflows/release-service.yml:Setup QEMU'
  '.github/workflows/release-service.yml:Setup Docker Buildx'
  '.github/workflows/release-service.yml:Login to GitHub Container Registry'
  '.github/workflows/release-service.yml:Build and push image'
  '.github/workflows/release-service.yml:Missing required release input\.'
  'scripts/prepare-release-matrix.mjs:Unsupported service:'
  'scripts/prepare-release-matrix.mjs:Missing required build arg env:'
)

for entry in "${auto_reject[@]}"; do
  file=${entry%%:*}
  pattern=${entry#*:}
  ! grep -Eq "$pattern" "$file"
done
