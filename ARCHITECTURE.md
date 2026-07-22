# Arquitetura — chitaofertas-bot

## Visão Geral

Bot que descobre ofertas da Shopee via API de Afiliados (GraphQL), filtra por produtos com avaliação, e publica em grupo do Telegram. Possui também um assistente de busca via DM (webhook).

**Duas fontes de entrada:**
- **Cron Job** (automático): varre keywords × sort types × páginas, posta até 5 produtos/minuto
- **Webhook Telegram** (solicitação do usuário): usuário envia termo de busca no DM, bot responde com o melhor resultado

**Monitor adicional:**
- **Price Drop Monitor** (cron separado): verifica periodicamente se produtos já postados tiveram queda de preço e notifica o grupo

---

## Diagrama de Componentes

```
src/
├── index.ts                            Entry point
│   ├── connectDb()                     Inicializa Prisma
│   ├── setWebhook()                    Registra webhook Telegram
│   ├── startScheduler()                Inicia cron principal
│   ├── startPriceMonitor()             Inicia cron de monitoramento
│   └── HTTP server (porta 8080)        Health check + POST /webhook
│
├── config/env.ts                       Variáveis de ambiente tipadas
│
├── db/index.ts                         PrismaClient singleton
│
├── lib/
│   ├── logger.ts                       Pino (estruturado)
│   ├── hash.ts                         SHA256 (dedup: offerHash, titleHash)
│   └── utils.ts                        formatPrice BRL, truncate, sleep
│
├── jobs/
│   ├── scheduler.ts                    Cron principal: fetchOffers → enrich → postOffer
│   │                                   MAX_POSTS_PER_CYCLE = 5
│   │                                   Lock concorrente (running flag)
│   │
│   └── priceMonitorJob.ts              Cron de monitoramento: checkPriceDrops
│                                       Lock concorrente (running flag)
│                                       Default: a cada 6 horas
│
├── services/
│   ├── shopee/index.ts                 Núcleo do negócio — API de Afiliados
│   │   ├── PRODUCTS_QUERY              GraphQL query productOfferV2
│   │   ├── fetchOffers(limit)          Com avanço de cursor (keyword/sort/page)
│   │   ├── searchProducts(keyword)     Sem cursor (para DM e price monitor)
│   │   ├── normalizeNode()             ProductOfferNode → ShopeeProduct
│   │   ├── enrichProduct()             ShopeeProduct → OfferData
│   │   ├── isProductRated()            ratingStar > 0 || soldCount > 0
│   │   └── Cursor state machine        77 keywords, 3 sort types, páginas 1-20
│   │
│   ├── offers/index.ts                 Formatação e persistência
│   │   ├── buildTelegramMessage()      Mensagem padrão "PRODUTO ENCONTRADO"
│   │   ├── buildPriceDropMessage()     Mensagem "PREÇO CAIU!"
│   │   ├── postOffer()                 Envia Telegram + upsert Prisma
│   │   ├── notifyPriceDrop()           Envia notificação de queda + upsert
│   │   ├── canPostOrUpdate()           Dedup + cooldown 4d + better price
│   │   └── daysSince()                 Calcula dias desde última postagem
│   │
│   ├── priceMonitor/index.ts           Lógica de monitoramento de preços
│   │   ├── checkPriceDrops()           Query offers → search Shopee → compare
│   │   │                               BATCH_SIZE por ciclo, ordered by lastCheck
│   │   └── touchCheckTime()            Atualiza timestamp de verificação
│   │
│   ├── telegram/
│   │   ├── index.ts                    API Telegram (send, reply, webhook)
│   │   └── handler.ts                  Processa updates do webhook (DM)
│   │
│   ├── amazon/index.ts                 Ofertas manuais (Amazon)
│   └── mock/index.ts                   Ofertas de teste
│
└── types/index.ts                      Interfaces: OfferData, ShopeeProduct,
                                        TelegramMessage, AmazonOfferInput
```

---

## Fluxo de Dados

### Fluxo A — Cron Principal (automático, grupo de promoções)

```
node-cron (a cada 1 minuto)
  │
  ▼
scheduler.runJob()
  ├─ running lock (previne concorrência)
  │
  ▼
tryShopee() — até 5 tentativas, max 5 posts/ciclo
  │
  ▼
fetchOffers(20)
  ├─ advanceState(): keywordIndex, sortTypeIndex, page
  ├─ 77 keywords × 3 sortTypes × 20 pages = 4620 combinações
  ├─ Salva cursor no Prisma (BotCursor)
  │
  ▼
normalizeNode() × 20
  │
  ▼
isProductRated() filter — remove sem rating
  │
  ▼
canPostOrUpdate()
  ├─ Se existe no DB: check 4d cooldown + preço menor → repost
  ├─ Se titleHash existe: check 4d cooldown
  └─ Se novo: permite
  │
  ▼
enrichProduct()
  └─ Mapeia ShopeeProduct → OfferData
  │
  ▼
postOffer()
  ├─ buildTelegramMessage() → HTML
  │   ├─ "🔥 PRODUTO ENCONTRADO"
  │   ├─ Título + Preço
  │   ├─ "💳 Mais desconto com Pix"
  │   └─ "🎟️ Mais desconto usando cupom da loja"
  ├─ sendTelegramPost() → API Telegram
  └─ upsert Prisma (Offer)
```

### Fluxo B — Webhook (DM do usuário)

```
Telegram envia POST /webhook
  │
  ▼
index.ts (HTTP server)
  ├─ Parseia JSON do body
  └─ handleUpdate()
  │
  ▼
handler.handleUpdate()
  ├─ chatType !== 'private' → return (ignora grupo)
  ├─ /start → mensagem de boas-vindas
  ├─ / → ignora comandos
  └─ Texto livre → handleSearch()
  │
  ▼
handleSearch(keyword)
  ├─ searchProducts(keyword) — busca sem cursor
  │   └─ productOfferV2(keyword, limit=5, sortType=1)
  ├─ Filtra por isProductRated
  ├─ canPostOrUpdate() — mesmo dedup do cron
  ├─ enrichProduct()
  └─ replyToMessage() → resultado formatado
```

### Fluxo C — Price Drop Monitor (periódico)

```
PRICE_DROP_CRON (default: "0 */6 * * *")
  │
  ▼
priceMonitorJob.runPriceCheck()
  ├─ running lock (previne concorrência)
  │
  ▼
checkPriceDrops()
  ├─ SELECT posted = true ORDER BY lastPriceCheckAt ASC NULLS FIRST
  │   LIMIT PRICE_CHECK_BATCH_SIZE (default: 20)
  │
  ▼
  Para cada produto:
  ├─ searchProducts(produto.title, limit=5, sortType=1)
  │
  ├─ Match por itemId nos resultados
  │
  ├─ Se encontrado e currentPrice < baseline:
  │   ├─ Calcula % de queda e valor economizado
  │   ├─ Se >= PRICE_DROP_THRESHOLD (%) e >= PRICE_DROP_MIN_AMOUNT (R$):
  │   │   ├─ buildPriceDropMessage()
  │   │   │   ├─ "📉 PREÇO CAIU! 📉"
  │   │   │   ├─ De: R$ X / Por: R$ Y
  │   │   │   └─ Economia de R$ Z (-N%)
  │   │   ├─ sendTelegramPost() → grupo
  │   │   └─ UPDATE: lastNotifiedDropPrice, lastNotifiedDropAt, price
  │   └─ Senão: só atualiza lastPriceCheckAt
  │
  └─ Se não encontrado: só atualiza lastPriceCheckAt
```

---

## Banco de Dados (PostgreSQL)

### Model `Offer`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | String (cuid) | PK |
| `source` | String | `'shopee'` \| `'amazon'` |
| `sourceId` | String | ID do produto na fonte |
| `title` | String | Nome do produto |
| `description` | String? | Descrição |
| `price` | Float? | Preço atual (priceMin) |
| `couponDiscountAmount` | Float? | Desconto de cupom |
| `estimatedFinalPrice` | Float? | Preço final estimado |
| `currency` | String? | `'BRL'` |
| `imageUrl` | String? | URL da imagem |
| `affiliateUrl` | String | Link de afiliado |
| `discountRate` | Int? | % de desconto da API |
| `commissionRate` | Float? | Comissão do afiliado |
| `ratingStar` | Float? | Avaliação (0-5) |
| `soldCount` | Int? | Qtd vendida |
| `titleHash` | String? | SHA256 do título (dedup) |
| `hash` | String **@unique** | SHA256(source:sourceId) |
| `posted` | Boolean | Já foi postado? |
| `postedAt` | DateTime? | Data da postagem |
| `createdAt` | DateTime | Data de criação |
| `lastPriceCheckAt` | DateTime? | Última verificação de preço (price monitor) |
| `lastNotifiedDropPrice` | Float? | Preço notificado no último drop |
| `lastNotifiedDropAt` | DateTime? | Data da última notificação de drop |

### Model `BotCursor`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | String @default("default") | PK |
| `shopeeKeywordIndex` | Int | Índice da keyword atual |
| `shopeeSortTypeIndex` | Int | Índice do sort type atual |
| `shopeePage` | Int | Página atual |

---

## API de Afiliados Shopee

**Endpoint:** `https://open-api.affiliate.shopee.com.br/graphql`

**Autenticação:** SHA256 HMAC com `appId` e `secret`

**Query:** `productOfferV2(keyword, sortType, page, limit)`

### Sort Types

| ID | Descrição |
|----|-----------|
| 1 | Relevância |
| 2 | Mais vendidos |
| 5 | Menor preço |

### Retorno (ProductOfferV2)

```
itemId, productName, imageUrl, price, priceMin, priceMax,
priceDiscountRate, offerLink, productLink, shopId,
commissionRate, commission, sales, shopName, ratingStar
```

### Limitações conhecidas

- `price_before_discount` não existe no schema — não expõe preço original
- `itemId`/`shopId` como argumentos existem no schema mas não retornam resultados
- PDP pública (`/api/v4/pdp/get_pc`) retorna 403 — anti-bot da Shopee (SGW)
- Não é possível lookup direto por `itemId` — apenas busca por keyword

---

## Regras de Negócio

| Regra | Implementação |
|-------|---------------|
| Só postar produtos com avaliação | `isProductRated()`: ratingStar > 0 ou soldCount > 0 |
| Sem repetição | `canPostOrUpdate()`: hash único (source:sourceId) |
| Repost após 4d com preço menor | `daysSince() < 4` bloqueia; `newPrice < existing.price` permite |
| Máximo por ciclo (cron principal) | `MAX_POSTS_PER_CYCLE = 5` |
| Lock de concorrência (cron principal) | `running` flag no scheduler |
| Lock de concorrência (price monitor) | `running` flag no priceMonitorJob |
| 5 tentativas por ciclo | `for attempt < 5` no tryShopee |
| Cursor persistente | `BotCursor` no PostgreSQL |
| Webhook só responde DM | `chatType !== 'private'` retorna early |
| Price drop threshold | `>= PRICE_DROP_THRESHOLD`% e `>= PRICE_DROP_MIN_AMOUNT` (R$) |
| Price drop baseline | `lastNotifiedDropPrice` (se já notificado) ou `price` (se nunca) |
| Processamento incremental | `ORDER BY lastPriceCheckAt ASC NULLS FIRST LIMIT batchSize` |

---

## Mensagens Telegram

### Produto encontrado (cron / Fluxo A)

```
🔥 PRODUTO ENCONTRADO

<título>

💰 Preço: <b>R$ X.XX</b>

💳 Mais desconto com Pix
🎟️ Mais desconto usando cupom da loja

<i>Via Shopee</i>

<b>LINK ✅</b> https://...
```

### Queda de preço (price monitor / Fluxo C)

```
📉 PREÇO CAIU! 📉

<título>

De: <b>R$ X.XX</b>
Por: <b>R$ Y.YY</b>
📉 Economia de <b>R$ Z.ZZ (-N%)</b>

💳 Mais desconto com Pix
🎟️ Mais desconto usando cupom da loja

<i>Via Shopee</i>

<b>LINK ✅</b> https://...
```

---

## Deploy (Fly.io)

| Config | Valor |
|--------|-------|
| **App** | `bot-ofertas-shopee` |
| **Build** | Docker multi-stage (node:22-slim) |
| **Porta** | 8080 (health check + webhook) |
| **Release** | `prisma db push` automático |
| **VM** | shared, 1 CPU, 256MB RAM |
| **HTTPS** | automático (fly-proxy) |

---

## Variáveis de Ambiente

| Variável | Obrigatória | Default | Descrição |
|----------|-------------|---------|-----------|
| `DATABASE_URL` | Sim | — | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | Sim | — | Token do bot no @BotFather |
| `TELEGRAM_CHAT_ID` | Sim | — | ID do grupo para postar |
| `SHOPEE_APP_ID` | Sim* | `""` | App ID da API de Afiliados |
| `SHOPEE_SECRET` | Sim* | `""` | Secret da API de Afiliados |
| `SHOPEE_BASE_URL` | Não | `https://open-api.affiliate.shopee.com.br/graphql` | URL base da API |
| `SHOPEE_SCRAPE_BASE_URL` | Não | `https://shopee.com.br` | URL Shopee (legacy) |
| `CRON_INTERVAL` | Não | `* * * * *` | Expressão cron do job principal |
| `PRICE_DROP_CRON` | Não | `0 */6 * * *` | Expressão cron do price monitor |
| `PRICE_DROP_THRESHOLD` | Não | `5` | % mínima de queda para notificar |
| `PRICE_DROP_MIN_AMOUNT` | Não | `5` | Valor mínimo em R$ para notificar |
| `PRICE_CHECK_BATCH_SIZE` | Não | `20` | Produtos checados por ciclo |
| `NODE_ENV` | Não | `development` | `development` ou `production` |
| `LOG_LEVEL` | Não | `info` | `info`, `debug`, `warn`, `error` |

*\* Obrigatórias apenas se a fonte Shopee estiver ativa.*

---

## Observações Técnicas

- **Sem dependências externas de scraping** — opera exclusivamente com a API de Afiliados
- **Sem headless browser** — Puppeteer/Playwright não são necessários
- **Sem serviços pagos** — TMAPI, ScrapingBee, etc. não são usados
- **Logging estruturado** — Pino com JSON em produção, pretty-print em dev
- **Dedup robusto** — hash SHA256 evita colisões, titleHash captura mesmo produto com IDs diferentes
- **Price monitor best-effort** — a API não suporta lookup por ID, então a busca é por título; produtos não encontrados são ignorados e tentados novamente no próximo ciclo
- **Processamento incremental** — o price monitor avança pelos produtos ordenados pelo `lastPriceCheckAt`, evitado sobrecarregar a API

---

## Melhorias Futuras

1. **Caching de busca** — evitar buscar o mesmo keyword/sort/page repetidamente
2. **Métricas** — contador de produtos postados, taxa de sucesso do webhook
3. **Comandos no grupo** — `/busca` no grupo (não só no DM)
4. **Whitelist/blacklist** de categorias ou sellers
5. **Preço mínimo** — threshold configurável para filtrar produtos muito baratos
6. **Dashboard** — página web simples com últimas postagens e estatísticas
7. **Notificação de queda de preço** — já implementado (este documento)
