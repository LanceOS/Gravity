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

EXPOSE 80