# bot-telegram

Bot que descobre ofertas da Shopee via API de Afiliados e publica em grupo do Telegram automaticamente.

## Como funciona

Duas fontes de dados trabalhando juntas:

- **Source A** — Shopee Affiliate Open API (GraphQL): descoberta de produtos, link de afiliado, preço atual
- **Source B** — Página pública do produto Shopee: preço original riscado, desconto exibido, cupons da loja

O bot combina as duas fontes para criar mensagens com preço, link de afiliado e informações de desconto.

## Fluxo

```
Agendador (cron)
  → API de Afiliados (Source A): lista de produtos
  → Filtro de avaliação: só produtos com rating
  → Página do produto (Source B): enriquecimento de preço
  → Mensagem formatada → enviada ao Telegram
  → Registro no banco (Prisma/PostgreSQL)
```

## Tecnologias

- Node.js + TypeScript
- Prisma + PostgreSQL
- node-cron
- Pino (logging)
- Docker / Fly.io

## Setup

```bash
pnpm install
cp .env.example .env
# preencher DATABASE_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SHOPEE_APP_ID, SHOPEE_SECRET
pnpm db:push
pnpm dev
```

## Deploy

```bash
fly deploy
```
