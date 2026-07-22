FROM node:22-slim AS base

RUN apt-get update -y && apt-get install -y openssl && apt-get clean && rm -rf /var/lib/apt/lists/*
RUN npm i -g pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

EXPOSE 8080
CMD ["node", "dist/index.js"]
