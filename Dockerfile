# Use official lightweight Bun image
FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# Install dependencies into temp directory to cache layers
FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Prerelease stage: copy node_modules and project files
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY . .

# Create directory for persistent SQLite database
RUN mkdir -p /app/data && chown -R bun:bun /app/data

USER bun
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=/app/data/payment_gateway.db

# Run database push on startup, then launch the gateway server
CMD ["sh", "-c", "bun run db:push && bun start"]
