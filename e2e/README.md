# Verification harness (not part of the product)
Runs the real route handlers and React components over HTTP without Next.js, with an in-memory database, so the browser can exercise them. It does NOT replace testing on the real Next.js build, PostgreSQL and Bachs sandbox.
    export NODE_PATH=<global node_modules containing playwright, esbuild(tsx), react>
    PORT=4600 tsx --tsconfig e2e/tsconfig.json e2e/server.tsx &
    B=http://localhost:4600 node e2e/smoke.cjs
