# Multi-stage Dockerfile for TanStack Start (Node.js SSR)
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base AS runner
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/.output /usr/src/app/.output
COPY --from=build /usr/src/app/package.json /usr/src/app/package.json

# Nitro/TanStack Start output includes a standalone server
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", ".output/server/index.mjs"]
