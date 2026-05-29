FROM node:20-slim AS development

WORKDIR /app/server

ENV NODE_ENV=development
ENV PORT=8080

# Install dependencies for local development (includes devDeps like tsx)
COPY server/package.json server/package-lock.json ./
RUN npm ci

# Copy server source and shared library for live-sync into container
COPY server ./src
COPY library /app/library

EXPOSE 8080

CMD ["npm", "run", "dev"]

FROM node:20-slim AS builder

WORKDIR /workspace

# Install server dependencies
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

# Install client dependencies (needed for building the client)
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci

# Copy server and client sources and any shared library
COPY server/tsconfig.json server/drizzle.config.ts ./server/
COPY server/src ./server/src
COPY client ./client
COPY library ./library

# Build client (Vite) then build server (TypeScript)
RUN cd client && npm run build
RUN cd server && npm run build

FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install only production dependencies for server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Copy built server and client assets into final image
COPY --from=builder /workspace/server/dist ./dist
COPY --from=builder /workspace/client/dist ./public

# Provide example env in image (do NOT copy secrets into image)
COPY docker/.env.example ./.env.example

EXPOSE 8080

CMD ["node", "dist/index.js"]