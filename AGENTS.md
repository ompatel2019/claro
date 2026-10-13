<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Working rules

- Run builds, typechecks, tests and Playwright through `q-run` (e.g. `q-run npm run check`) when it is on PATH; it caps the box at 2 heavy jobs.
- Commit as Om Patel <ompatel2019@gmail.com>.
- `npm run check` must be green before any push.
- Keep changes small and lean; no unused code.
