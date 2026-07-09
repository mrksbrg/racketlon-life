# Racketlon Life

A mobile-friendly management game about an amateur racketlon career — table tennis,
badminton, squash, and tennis, one week at a time, never enough time, money, or energy.

Sources of inspiration: Jones in the Fast Lane, Rimworld, Progress Quest, Football Manager, and Agricola. 

## Quick start

```bash
npm install
npm test        # engine + content test suites
npm run check   # type checks (tsc + svelte-check)
npm run dev     # dev server → http://localhost:5173
```

## Repository layout

```
docs/               design docs (read 01 → 06)
packages/engine     pure TypeScript simulation engine — deterministic, no I/O
packages/content    data bundles (JSON + zod) — the world lives here
apps/web            Svelte 5 mobile-first UI
```

## Design docs

1. [Vision](docs/01-vision.md) — what the game is and the design pillars
2. [Domain model](docs/02-domain-model.md) — players, skills vs ratings, plans, state
3. [Architecture](docs/03-architecture.md) — packages, weekly pipeline, determinism, pitfalls
4. [Simulation systems](docs/04-simulation-systems.md) — system-by-system spec and run order
5. [Content and data](docs/05-content-and-data.md) — bundles, FIR import, event DSL
6. [MVP roadmap](docs/06-mvp-roadmap.md) — M0 (done) → M4
7. [UI screens & IA](docs/07-ui-screens.md) — navigation, screen inventory, the three information layers
