# ---- Capiva Cloud — Backend (Bun) ----
FROM oven/bun:1 AS base
WORKDIR /app

# Dependências (o pacote interno de decorators é resolvido via file:)
COPY package.json bunfig.toml tsconfig.json ./
COPY prisma ./prisma
RUN bun install || true

COPY . .

# Gera o Prisma Client
RUN bunx prisma generate || true

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "src/index.ts"]
