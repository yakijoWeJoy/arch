# Build stage: install deps (incl. native better-sqlite3) and build the SPA
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage: no network access needed at runtime
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DB_FILE=/app/data/arch.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY package.json ./
VOLUME /app/data
EXPOSE 8080
CMD ["npx", "tsx", "src/server/main.ts"]
