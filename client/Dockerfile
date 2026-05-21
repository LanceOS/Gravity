FROM node:20-slim AS builder

WORKDIR /app

# Copy only the client package files first for install
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci

# Copy the full repository so that sibling folders (like ../library) are available
COPY . .

WORKDIR /app/client
RUN npm run build

FROM nginx:1.27-alpine AS runner

ENV BACKEND_UPSTREAM=http://backend:8080

# Use the client nginx template
COPY client/nginx.template.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 80
