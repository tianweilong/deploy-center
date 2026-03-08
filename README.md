# Deploy Center

A private, multi-service deployment control centre.

This repository stores environment-first deployment state, release workflows,
and future pull-based deployment integration points for multiple services.

## GitHub configuration

Required repository secrets:

- `TENCENT_REGISTRY`
- `TENCENT_REGISTRY_USERNAME`
- `TENCENT_REGISTRY_PASSWORD`
- `VK_PRIVATE_DEPLOY_KEY`
- `SOURCE_REPO_TOKEN`

Required environment variables:

- `dev` → `VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL`
- `prod` → `VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL`

`vibe-kanban` only keeps one trigger secret:

- `DEPLOY_CENTER_TRIGGER_TOKEN`
