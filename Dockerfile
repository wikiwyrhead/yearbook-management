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
COPY --from=build /usr/src/app/.output /usr/src/app/.output
COPY --from=build /usr/src/app/package.json /usr/src/app/package.json

# Nitro/TanStack Start output includes a standalone server
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", ".output/server/index.mjs"]

