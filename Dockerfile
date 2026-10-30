# NOT BUILT OR RUN YET: no Docker or internet in the authoring environment. First real build must be done in CI or on your machine.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS run
ENV NODE_ENV=production PORT=3000 MEDIA_DIR=/data/uploads PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates fonts-noto fonts-noto-color-emoji && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
RUN npx --yes playwright@1 install --with-deps chromium && mkdir -p /data/uploads && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
