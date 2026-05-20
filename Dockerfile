# ==========================================
# Stage 1: Build front-end static assets
# ==========================================
FROM node:20-slim AS builder

# Install build dependencies for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    gcc \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package configurations
COPY package.json package-lock.json ./

# Install dependencies (both prod and dev, to build Vite)
RUN npm ci

# Copy application source code
COPY . .

# Compile TypeScript and build Vite production bundle to /dist
RUN npm run build

# ==========================================
# Stage 2: Minimal runtime image
# ==========================================
FROM node:20-slim AS runner

# Install sqlite3 runtime utility
RUN apt-get update && apt-get install -y \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000
ENV DB_DIR=/app/data

# Create data directory for database persistence
RUN mkdir -p /app/data

# Copy built frontend client assets from builder
COPY --from=builder /app/dist /app/dist

# Copy installed node_modules from builder (includes native addons built on exact same node:20-slim architecture)
COPY --from=builder /app/node_modules /app/node_modules

# Copy server code and configs
COPY --from=builder /app/server /app/server
COPY --from=builder /app/package.json /app/package.json

EXPOSE 5000

# Run the backend Express server with tsx directly from node_modules (pre-bundled devDependency)
CMD ["npx", "tsx", "server/index.ts"]
