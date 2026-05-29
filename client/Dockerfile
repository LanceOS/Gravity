FROM node:20-slim AS development

WORKDIR /app/client

ENV NODE_ENV=development

# Install dev dependencies for running the Vite dev server inside the container
COPY client/package.json client/package-lock.json ./
RUN npm ci

# Copy source and shared library for live-sync into the container
COPY client ./
COPY library /app/library

EXPOSE 5173

CMD ["npm", "run", "dev"]

FROM node:20-slim AS builder

WORKDIR /app/client

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client ./
COPY library ../library
RUN npm run build

FROM nginx:1.27-alpine AS runner

ENV BACKEND_UPSTREAM=http://backend:8080

COPY client/nginx.template.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 5173