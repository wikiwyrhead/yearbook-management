# Multi-stage Dockerfile for TanStack Start (Node.js SSR)
FROM node:22-slim AS base
WORKDIR /usr/src/app

FROM base AS build
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=build /usr/src/app/.output /usr/src/app/.output
COPY --from=build /usr/src/app/package.json /usr/src/app/package.json
COPY --from=build /usr/src/app/scripts /usr/src/app/scripts
COPY --from=build /usr/src/app/src/lib/db/schema.sql /usr/src/app/src/lib/db/schema.sql

# Nitro/TanStack Start output includes a standalone server
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "node scripts/init-local-db.mjs && node .output/server/index.mjs"]
