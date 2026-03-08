# Rollout Guide

## Required repository secrets

- `TENCENT_REGISTRY`
- `TENCENT_REGISTRY_USERNAME`
- `TENCENT_REGISTRY_PASSWORD`
- `VK_PRIVATE_DEPLOY_KEY`
- `SOURCE_REPO_TOKEN`

## Required application-repo trigger secret

The source repository still needs one narrow trigger secret to start workflows in `deploy-center`.
Recommended name in `tianweilong/vibe-kanban`:

- `DEPLOY_CENTER_TRIGGER_TOKEN`
