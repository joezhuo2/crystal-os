# Contributing to Crystal OS

Thanks for taking the time to help. Crystal OS is a personal project, so reviews can take a few days.

## Before you start

- **Bugs and small fixes:** open an issue or go straight to a pull request.
- **New features:** open an issue first and describe what you want to build. This saves you from writing something that does not fit the app.
- **Security problems:** do not open a public issue. Follow [SECURITY.md](SECURITY.md).

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

You need Node.js 20 or newer. The desktop app also needs Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run dev:desktop
```

`npm run dev` starts the web app. `npm run dev:desktop` starts the Tauri desktop app. The README's Quick Start section explains the keys in `.env.local`.

## Make a change

1. Fork the repository and create a branch from `main`, for example `feat/palette-actions` or `fix/task-snooze`.
2. Keep the change small and about one thing. Several small pull requests are easier to review than one large one.
3. Add or update a Vitest test for any new logic.
4. Run the checks below. All three must pass.

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(palette): run task actions from the command palette
fix(tasks): keep the snooze date when a task is edited
docs: add contributing guide
```

Keep commits small. Never commit secrets: `.env.local`, API keys, tokens, or your own data files such as `trades.json` and `mail-cache.json`.

## Pull requests

- Say what the change does and why, and link the issue it closes (`Closes #123`).
- Add a screenshot or a short recording for a visible change.
- Say what you tested and what you did not.
- Add a line to `CHANGELOG.md` under the unreleased section if the change is visible to users.

## Code style

- TypeScript and React function components. Follow the patterns in the files around your change.
- Reuse what exists in `src/components/ui`, `src/hooks` and `src/lib` before you add a new helper or dependency.
- ESLint is the formatter of record. Do not reformat code you did not change.

## Licence

Crystal OS is released under the [MIT License](LICENSE). Your contributions are released under the same licence.
