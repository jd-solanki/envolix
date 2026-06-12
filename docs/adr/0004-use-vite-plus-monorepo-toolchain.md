# Use Vite+ monorepo toolchain

The repository uses Vite+ as the canonical monorepo toolchain, with `vp` for task running and the root `vite.config.ts` owning linting, formatting, testing, caching, and package packing configuration. The project targets the current Node.js LTS major line, Node 24, regardless of a contributor's global Node version, so Vite+ runtime management can keep local development consistent while allowing patch updates.
