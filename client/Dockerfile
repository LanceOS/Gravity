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
COPY --chown=node:node client ./client
COPY --chown=node:node library ./library
COPY --chown=node:node server/src/lib/html-sanitization-policy.ts ./server/src/lib/html-sanitization-policy.ts
COPY --chown=node:node server/src/lib/rich-text-schema.ts ./server/src/lib/rich-text-schema.ts
WORKDIR /app/client
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM development AS builder
RUN npm run build

FROM docker.io/nginxinc/nginx-unprivileged:1.27-alpine AS runner
ENV BACKEND_UPSTREAM=http://backend:8080
COPY --chown=nginx:nginx client/nginx.template.conf /etc/nginx/templates/default.conf.template
COPY --from=builder --chown=nginx:nginx /app/client/dist /usr/share/nginx/html
EXPOSE 5173
