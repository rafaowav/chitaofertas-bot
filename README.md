# chitaofertas-bot

Bot que descobre ofertas da Shopee via API de Afiliados e publica em grupo do Telegram automaticamente. Inclui monitor de queda de preço para produtos já postados.

## Como funciona

O bot usa a **Shopee Affiliate Open API (GraphQL)** para descobrir produtos, obter o link de afiliado e o preço atual. Produtos sem avaliação (rating = 0 e sem vendas) são filtrados automaticamente.

O preço exibido na mensagem é o `priceMin` da API de Afiliados — o mesmo preço vinculado ao link de rastreamento.

> **Nota:** Anteriormente o bot tentava enriquecer os dados com a página pública do produto Shopee (Source B) para extrair preço original riscado e cupons. A Shopee passou a bloquear todas as chamadas de API não-navegador (erro 90309999), tornando essa abordagem inviável. O bot opera exclusivamente com os dados da API de Afiliados.

## Busca no DM (assistente pessoal)

Envie qualquer termo de busca no privado do bot. Ele retorna até **3 resultados** mais relevantes, ranqueados por:

- **Match exato** do título com o termo buscado (peso maior)
- **Rating** e quantidade de vendas (bônus)
- **Penalidade** para acessórios quando o termo não é sobre acessórios

```
🔍 Resultados para "iphone 11"

1️⃣ iPhone 11 64GB
💰 R$ 2.299,00
⭐ 4.8 | 📦 5231 vendidos
🔗 https://...

2️⃣ iPhone 11 128GB
💰 R$ 2.699,00
⭐ 4.9 | 📦 3892 vendidos
🔗 https://...

💳 Mais desconto com Pix
🎟️ Mais desconto usando cupom da loja
```

## Monitor de Queda de Preço

O bot verifica periodicamente (a cada 6h por padrão) se produtos já postados tiveram redução de preço. Quando detecta uma queda acima do threshold configurado, envia uma notificação específica ao grupo:

```
📉 PREÇO CAIU! 📉

<título>

De: R$ X.XX
Por: R$ Y.YY
📉 Economia de R$ Z.ZZ (-N%)
...
```

### Comportamento

- Busca o preço atual do produto via API de Afiliados (pelo título)
- Compara com o último preço notificado
- Notifica apenas se a queda for ≥ `PRICE_DROP_THRESHOLD`% **e** ≥ `PRICE_DROP_MIN_AMOUNT` (R$)
- Processa `PRICE_CHECK_BATCH_SIZE` produtos por ciclo (default: 20), em ordem do mais antigo sem verificar
- Não altera o fluxo existente de descoberta de novos produtos

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
- **Agendador:** node-cron (x2: job principal + price monitor)
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
| `PRICE_DROP_CRON` | Cron do monitor de preço (default: `0 */6 * * *`) |
| `PRICE_DROP_THRESHOLD` | % mínima de queda para notificar (default: `5`) |
| `PRICE_DROP_MIN_AMOUNT` | Valor mínimo em R$ para notificar (default: `5`) |
| `PRICE_CHECK_BATCH_SIZE` | Produtos checados por ciclo (default: `20`) |

```bash
pnpm db:push     # criar/atualizar tabelas no banco
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
├── jobs/
│   ├── scheduler.ts            # cron job (descoberta de ofertas)
│   └── priceMonitorJob.ts      # cron job (monitor de queda de preço)
├── services/
│   ├── shopee/index.ts         # API de Afiliados + enriquecimento
│   ├── offers/index.ts         # formatação e postagem
│   ├── priceMonitor/index.ts   # lógica de verificação de preços
│   ├── telegram/
│   │   ├── index.ts            # envio ao Telegram (send, reply, webhook)
│   │   └── handler.ts          # processamento de updates
│   ├── amazon/index.ts         # ofertas manuais (Amazon)
│   └── mock/index.ts           # ofertas de teste
└── types/index.ts              # tipos compartilhados

> Documentação completa da arquitetura em [ARCHITECTURE.md](./ARCHITECTURE.md).
```

## Variáveis de ambiente

Todas as variáveis estão documentadas em `.env.example`.
