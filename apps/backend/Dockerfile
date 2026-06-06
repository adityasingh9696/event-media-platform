FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
RUN npm install -g pnpm

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" pnpm --filter backend run db:generate
RUN pnpm --filter backend run build

# Production runner stage
FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm

# Copy package descriptors for workspaces
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/backend/package.json ./apps/backend/

# Copy built bundles and assets
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

EXPOSE 4000

# Set working directory to backend for start commands
WORKDIR /app/apps/backend

# Default command runs the Fastify API server
CMD ["pnpm", "run", "start"]
