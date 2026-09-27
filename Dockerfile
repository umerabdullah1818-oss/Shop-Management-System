FROM node:20-bookworm-slim

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile && pnpm db:generate

EXPOSE 3000 3002 4000