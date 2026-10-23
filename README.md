# Engineer Cockpit — Frontend

React + Vite frontend for Engineer Cockpit.

## Stack

- React 19
- TypeScript (strict)
- Vite
- Tailwind CSS v4
- React Router v7
- TanStack Query
- Native `fetch` API client

## Scripts

```bash
npm run dev        # start Vite dev server on http://localhost:5173
npm run build      # typecheck and build production bundle
npm run preview    # preview production build
npm run lint       # run oxlint
npm run typecheck  # run TypeScript project build
```

## API proxy

Development requests to `/api/*` are proxied to the backend at
`http://localhost:3000` by `vite.config.ts`. This keeps cookies same-origin
during local development.

To point the frontend directly at another backend, create `.env`:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

Leave it empty to use the proxy.

## Structure

```text
src/
  components/
    brand/          brand mark
    layout/         route layouts
    ui/             shared Tailwind primitives
  features/
    auth/           auth api, components, hooks, pages, schemas, types
    credentials/    credential api, components, hooks, pages, schemas, types
  lib/
    api-client.ts   fetch wrapper, typed errors, JSON handling
    query-client.ts TanStack Query client
  pages/            general app pages
  providers/        app-wide providers
  routes/           React Router configuration
  types/            shared TypeScript types
  utils/            small utilities
```

Feature code stays inside its feature folder. Shared code goes in
`components`, `lib`, `types`, or `utils` only when reused across features.

## Current state

Frontend foundation only. Authentication pages and credential pages are next.
