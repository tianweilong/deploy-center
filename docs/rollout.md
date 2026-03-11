# Rollout Guide

## Required repository secrets

- `VK_PRIVATE_DEPLOY_KEY`
- `SOURCE_REPO_TOKEN`

## Required deployment host credentials

- PAT classic with `read:packages`
- Login command: `docker login ghcr.io`

## Required application-repo trigger secret

The source repository still needs one narrow trigger secret to start workflows in `deploy-center`.
Recommended name in `tianweilong/vibe-kanban`:

- `DEPLOY_CENTER_TRIGGER_TOKEN`
