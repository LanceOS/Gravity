FROM docker.io/library/node:22-slim AS dependencies
WORKDIR /app
RUN chown node:node /app
USER node

# The repository root lockfile owns both npm workspaces.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node client/package.json ./client/
COPY --chown=node:node server/package.json ./server/
RUN npm ci --include=dev

FROM dependencies AS development
ENV NODE_ENV=development
ENV PORT=8080
COPY --chown=node:node server ./server
COPY --chown=node:node library ./library
WORKDIR /app/server
EXPOSE 8080
CMD ["npm", "run", "dev"]

FROM dependencies AS builder
COPY --chown=node:node server/tsconfig.json server/drizzle.config.ts ./server/
COPY --chown=node:node server/src ./server/src
COPY --chown=node:node client ./client
COPY --chown=node:node library ./library
RUN npm run build

FROM docker.io/library/node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
RUN chown node:node /app
USER node

# Retain workspace layout so hoisted and server-local dependencies both resolve.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node client/package.json ./client/
COPY --chown=node:node server/package.json ./server/
RUN npm ci --omit=dev --workspace=server --include-workspace-root=false
COPY --from=builder --chown=node:node /app/server/dist ./server/dist
COPY --from=builder --chown=node:node /app/client/dist ./server/public
COPY --chown=node:node docker/.env.example ./server/.env.example
WORKDIR /app/server
EXPOSE 8080
CMD ["node", "dist/index.js"]
