# chitaofertas-bot

Bot que descobre ofertas da Shopee via API de Afiliados e publica em grupo do Telegram automaticamente.

## Como funciona

O bot usa a **Shopee Affiliate Open API (GraphQL)** para descobrir produtos, obter o link de afiliado e o preço atual. Produtos sem avaliação (rating = 0 e sem vendas) são filtrados automaticamente.

O preço exibido na mensagem é o `priceMin` da API de Afiliados — o mesmo preço vinculado ao link de rastreamento.

> **Nota:** Anteriormente o bot tentava enriquecer os dados com a página pública do produto Shopee (Source B) para extrair preço original riscado e cupons. A Shopee passou a bloquear todas as chamadas de API não-navegador (erro 90309999), tornando essa abordagem inviável. O bot opera exclusivamente com os dados da API de Afiliados.

## Fluxo

```
Cron (a cada 1 minuto)
  │
  ▼
API de Afiliados (productOfferV2)
  ├─ 77 keywords + 3 sort types + páginas 1-20
  └─ retorna: priceMin, link afiliado, ratingStar, sales
  │
  ▼
Filtro de avaliação
  └─ só produtos com ratingStar > 0 ou soldCount > 0
  │
  ▼
Enriquecimento
  └─ dados da API de Afiliados → OfferData
  │
  ▼
Mensagem Telegram
  ├─ título + preço + link de afiliado
  ├─ "💳 Mais desconto com Pix"
  └─ "🎟️ Mais desconto usando cupom da loja"
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
│   ├── shopee/index.ts         # API de Afiliados + enriquecimento
│   ├── offers/index.ts         # formatação e postagem
│   ├── telegram/index.ts       # envio ao Telegram
│   ├── amazon/index.ts         # ofertas manuais (Amazon)
│   └── mock/index.ts           # ofertas de teste
└── types/index.ts              # tipos compartilhados
```

## Variáveis de ambiente

Todas as variáveis estão documentadas em `.env.example`.
