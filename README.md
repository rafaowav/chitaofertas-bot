# chitaofertas-bot

Bot que descobre ofertas da Shopee via API de Afiliados e publica em grupo do Telegram automaticamente.

## Como funciona

O bot usa duas fontes de dados:

- **Source A** — Shopee Affiliate Open API (GraphQL): descoberta de produtos, link de afiliado, preço mínimo, rating, vendas
- **Source B** — Página pública do produto Shopee: preço original riscado, desconto exibido, cupons da loja, variações

O fluxo combina as duas: a API de afiliados descobre os produtos e fornece o link de rastreamento, enquanto a página do produto enriquece os dados de preço e desconto. O bot só publica produtos que tenham avaliação (rating > 0 ou vendas > 0).

## Fluxo completo

```
Cron (a cada 1 minuto)
  │
  ▼
API de Afiliados (Source A)
  ├─ 77 keywords + 3 sort types + páginas 1-20
  ├─ productOfferV2 (GraphQL)
  └─ retorna: productId, shopId, priceMin, link afiliado, ratingStar, sales
  │
  ▼
Filtro de avaliação
  ├─ só produtos com ratingStar > 0 ou soldCount > 0
  └─ produtos sem avaliação são ignorados
  │
  ▼
Página do produto (Source B)
  ├─ GET /api/v4/pdp/get_pc (tentativa 1)
  ├─ HTML / __NEXT_DATA__ (fallback)
  ├─ extrai: price_before_discount, price, discount badge, shop_vouchers
  └─ resolução de variantes por modelo
  │
  ▼
Enriquecimento
  ├─ preço exibido = preço da API de afiliados
  ├─ dados da página armazenados para referência
  └─ cupom da loja extraído quando disponível
  │
  ▼
Mensagem Telegram
  ├─ título + preço + link de afiliado
  ├─ "Mais desconto com Pix"
  └─ "Mais desconto usando cupom da loja"
  │
  ▼
Persistência
  └─ Prisma / PostgreSQL (impede republicação)
```

## Tecnologias

- **Runtime:** Node.js 22 + TypeScript
- **Banco:** PostgreSQL + Prisma ORM
- **Agendador:** node-cron
- **Logging:** Pino
- **Deploy:** Docker / Fly.io
- **Gerenciamento:** PM2 (Oracle Cloud)

## Setup

```bash
pnpm install
cp .env.example .env
```

Preencher variáveis no `.env`:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | string de conexão PostgreSQL |
| `TELEGRAM_BOT_TOKEN` | token do bot no @BotFather |
| `TELEGRAM_CHAT_ID` | ID do grupo/canal para postar |
| `SHOPEE_APP_ID` | App ID da Shopee Affiliate API |
| `SHOPEE_SECRET` | Secret da Shopee Affiliate API |

```bash
pnpm db:push     # criar tabelas no banco
pnpm dev         # desenvolvimento com tsx
```

## Scripts

| Comando | Descrição |
|---|---|
| `pnpm dev` | executa com tsx (hot reload) |
| `pnpm build` | compila TypeScript |
| `pnpm start` | roda o build de produção |
| `pnpm db:push` | sincroniza schema do Prisma |
| `pnpm db:generate` | gera Prisma Client |

## Deploy

### Fly.io

```bash
fly deploy
```

O `fly.toml` executa `prisma db push` automaticamente no release.

### Oracle Cloud (Free Tier)

```bash
# Na VM Ubuntu
git clone https://github.com/rafaowav/chitaofertas-bot.git
cd chitaofertas-bot
cp .env.example .env
nano .env
pnpm install
pnpm db:push
pm2 start ecosystem.config.js
pm2 save
```

## Estrutura

```
src/
├── index.ts                    # entrada
├── config/env.ts               # variáveis de ambiente
├── db/index.ts                 # Prisma Client
├── lib/
│   ├── logger.ts               # Pino logger
│   ├── hash.ts                 # SHA256 (dedup)
│   └── utils.ts                # formatação BRL
├── jobs/
│   └── scheduler.ts            # cron job
├── services/
│   ├── shopee/
│   │   ├── index.ts            # API de Afiliados + enriquecimento
│   │   └── detail-client.ts    # scraper da página do produto
│   ├── offers/index.ts         # formatação e postagem
│   ├── telegram/index.ts       # envio ao Telegram
│   ├── amazon/index.ts         # ofertas manuais (Amazon)
│   └── mock/index.ts           # ofertas de teste
└── types/index.ts              # tipos compartilhados
```

## Variáveis de ambiente

Todas as variáveis estão documentadas em `.env.example`.
