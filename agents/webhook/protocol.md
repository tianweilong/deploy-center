# Webhook Protocol

## Intent

A future server-side agent receives webhook refresh events, pulls `deploy-center`, and reconciles the target environment to the deployment descriptors stored in Git.

## Expected payload fields

- `repository`
- `environment`
- `services`
- `sha`
- `ref`
- `deployment_commit`

## Agent responsibilities

1. Validate webhook authenticity.
2. Pull latest `deploy-center` state.
3. Load matching `deployment.yaml` files.
4. Pull the desired image tags.
5. Reconcile Docker Compose services.
6. Record local deployment results.
