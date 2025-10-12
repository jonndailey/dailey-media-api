# Repository Guidelines

## Project Structure & Module Organization
- `src/` hosts the Express service: `routes/` for HTTP handlers, `controllers/` for request orchestration, `services/` for storage/auth integrations, and `middleware/` for cross-cutting concerns. `config/index.js` centralizes environment switches, while `scripts/` contains maintenance tasks like migrations.
- `tests/` is reserved for Jest suites; keep service-specific fixtures in `test-files/`. Persistent artifacts (uploads, generated media) live under `storage/` and `uploads/` during local runs.
- `docs/`, `data/`, and `web/` hold supporting assets; keep API docs and operational notes here so the root stays focused on the API.

## Build, Test, and Development Commands
- `npm run dev` – start the API with nodemon auto-reloads.
- `npm start` – launch the production entry point.
- `npm test` – execute Jest unit/integration suites.
- `npm run lint` – run ESLint across `src/`.
- `npm run migrate` – execute database migrations in `src/scripts/migrate.js`.
- `npm run pm2:start|stop|restart|reload` – manage the PM2 process described in `ecosystem.config.cjs`.

## Coding Style & Naming Conventions
- Source files use ECMAScript modules with two-space indentation, trailing semicolons, and single quotes (see `src/index.js`).
- Favor `camelCase` for functions/variables, `PascalCase` for classes, and file names that describe their feature (`files.js`, `databaseService.js`).
- Run `npm run lint` before commits; align with the default ESLint config (Node 20 syntax) and resolve warnings rather than silencing them.

## Testing Guidelines
- Write Jest specs beside service areas inside `tests/`, mirroring the `src/` structure (`tests/routes/files.spec.js`, etc.).
- Use `supertest` for HTTP contracts and stage binary fixtures under `test-files/`.
- Target meaningful coverage on new endpoints; add `npm test -- --coverage` locally when validating extensive changes.

## Commit & Pull Request Guidelines
- Follow the existing history: concise, imperative sentences with capitalized first word (`Add PM2 process management`). Reference issues with `(#123)` when relevant.
- For pull requests, include: a clear problem statement, summary of changes, testing evidence (command output or screenshots for routes), and notes on environment/config updates (`.env` keys, S3 buckets, Redis channels).
- Keep PRs focused; split large refactors from behavioral changes to ease review.

## Configuration & Operations
- Copy `.env.example` to `.env` and supply DB, Redis, and S3 credentials; avoid committing secrets.
- Local PM2 usage relies on Node ≥ 20 and writes logs to `logs/`; rotate or clear them before shipping artifacts.
- Document any new environment toggle or storage bucket addition in `docs/` to keep operational handoffs smooth.
