# Contributing

## Workflow

1. Branch from `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `ci/…`, `test/…`.
2. Make the change with tests. Run `npm run verify`, and `npm run build && npm run e2e` when pages,
   routing, headers or the session changed.
3. Open a pull request with a [Conventional Commits](https://www.conventionalcommits.org/) title, e.g.
   `feat(editor): autosave drafts`. CI must be green; each pull request gets a Netlify preview.
4. Squash-merge.

## Conventions

- **TypeScript strict**, no `any`, no non-null assertions in app code. ESLint and Prettier decide style.
- **Talk to the API only through `src/api/endpoints.ts`**, and add a zod schema for every new response.
  If the contract changed, refresh `contract/openapi.json` (see `contract/README.md`).
- **Test like a user**: query by role, label and text (Testing Library), not by class names or test ids.
  The mock API in `src/mocks` must keep following blog-backend's rules; extend it with the feature.
- **Accessibility is part of done**: labels for every input, keyboard support, visible focus, and the
  axe scan in the end-to-end tests stays green.
- **Never weaken the CSP** (no inline scripts or styles, no `unsafe-*`); the end-to-end tests fail on
  violations.
