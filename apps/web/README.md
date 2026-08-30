# PHAROS web application

This directory contains the Next.js dashboard and Chaos Lab for PHAROS.

Use the repository-level [README](../../README.md) for prerequisites, local environment
variables, the full demo runbook, deployment notes, and architecture context.

From this directory, use pnpm only:

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm build
```

The operational UI consumes the live Control Tower runtime. It intentionally shows an
explicit unavailable state rather than falling back to illustrative operational data.
