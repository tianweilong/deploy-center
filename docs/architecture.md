# Architecture

`deploy-center` is an environment-first, multi-service deployment control repository.

- Application repositories run CI and trigger release orchestration.
- `deploy-center` checks out source code, builds images, pushes to the registry, and records deployment state.
- A future pull-based agent will reconcile state from this repository onto target servers.
