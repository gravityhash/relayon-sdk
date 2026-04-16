# Contributing to @relayon/sdk

Thanks for your interest! This is the official TypeScript SDK for
[Relayon.io](https://relayon.io), a self-hosted background job and task
scheduling platform.

## Development

```bash
git clone git@github.com:gravityhash/relayon-sdk.git
cd relayon-sdk
npm install
npm run check        # clean + typecheck + build
```

## Running the integration tests

The tests hit a real Relayon API. Easiest path: run the reference server
locally.

```bash
# In another checkout, run the Relayon API + worker against a local Postgres.
# Then:
export DATABASE_URL="postgresql://relayon:relayon@localhost:5432/relayon_que"
npm run test:integration
```

## Pull requests

- Branch from `main`, keep PRs focused (one feature / fix per PR).
- Every PR must pass `npm run check`.
- Add or update tests in `test/integration.ts` when changing behaviour.
- Update `README.md` if you change the public API surface.

## Releasing (maintainers only)

```bash
# 1. Bump version in package.json
# 2. Commit: "chore: release vX.Y.Z"
# 3. Tag:   git tag -a vX.Y.Z -m "vX.Y.Z"
# 4. Push:  git push && git push --tags
# 5. npm:   npm run release
```

The `release` script runs `preflight` (see `scripts/preflight.js`) which
hard-fails on a dirty tree, missing LICENSE, secret-like patterns in
source, or a version already on the registry.

## Code of conduct

Be kind. Assume good intent. Disagree technically, not personally.
