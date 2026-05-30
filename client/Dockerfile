FROM docker.io/library/node:20-slim AS development

WORKDIR /app/client

ENV NODE_ENV=development

# Setup directories and non-root node user permissions
RUN mkdir -p /app/client /app/library && chown -R node:node /app

USER node

# Install dev dependencies for running the Vite dev server inside the container
COPY --chown=node:node client/package.json client/package-lock.json ./
RUN npm ci

# Copy source and shared library for live-sync into the container
COPY --chown=node:node client ./
COPY --chown=node:node library /app/library

EXPOSE 5173

CMD ["npm", "run", "dev"]

FROM docker.io/library/node:20-slim AS builder

WORKDIR /app/client

RUN mkdir -p /app/client /app/library && chown -R node:node /app

USER node

COPY --chown=node:node client/package.json client/package-lock.json ./
RUN npm ci

COPY --chown=node:node client ./
COPY --chown=node:node library ../library
RUN npm run build

FROM docker.io/nginxinc/nginx-unprivileged:1.27-alpine AS runner

ENV BACKEND_UPSTREAM=http://backend:8080

COPY --chown=nginx:nginx client/nginx.template.conf /etc/nginx/templates/default.conf.template
COPY --from=builder --chown=nginx:nginx /app/client/dist /usr/share/nginx/html

EXPOSE 5173