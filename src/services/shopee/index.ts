import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../db/index.js';
import type { ShopeeProduct, OfferData } from '../../types/index.js';

/* ------------------------------------------------------------------ */
/*  SOURCE A — Shopee Affiliate Open API (GraphQL)                     */
/* ------------------------------------------------------------------ */
/*  Source-field legend:                                               */
/*   priceMin  → current minimum selling price across variations       */
/*   priceMax  → maximum price across variations — NEVER used as       */
/*               originalPrice; only shop product page provides origin */
/*   price     → single current price (may be same as priceMin)        */
/*   priceDiscountRate → raw discount percent from API (e.g. 47        */
/*               for 47%).  NEVER used to derive originalPrice.       */
/*   productLink → canonical Shopee product page URL                  */
/*   offerLink → affiliate tracking link                              */
/* ------------------------------------------------------------------ */

const PRODUCTS_QUERY = `query Offers($keyword: String, $sortType: Int, $page: Int, $limit: Int) {
  productOfferV2(keyword: $keyword, sortType: $sortType, page: $page, limit: $limit) {
    nodes {
      itemId
      productName
      imageUrl
      price
      priceMin
      priceMax
      priceDiscountRate
      offerLink
      productLink
      shopId
      commissionRate
      commission
      sales
      shopName
      ratingStar
    }
    pageInfo {
      page
      limit
      hasNextPage
    }
  }
}`;

const KEYWORDS = [
  '', 'celular', 'fone', 'tv', 'notebook', 'tablet', 'smartwatch',
  'relogio', 'perfume', 'tenis', 'bolsa', 'mochila', 'roupa',
  'video game', 'cadeira', 'mesa', 'cama', 'sofa', 'geladeira',
  'microondas', 'cafeteira', 'ferramentas', 'brinquedos',
  'maquiagem', 'suplemento', 'fitness', 'camping', 'pet', 'bebe',
  'iphone', 'samsung', 'xiaomi', 'jbl', 'logitech', 'mouse',
  'teclado', 'monitor', 'webcam', 'roteador', 'carregador',
  'power bank', 'ssd', 'hd externo', 'fone gamer', 'cadeira gamer',
  'mesa gamer', 'tv 4k', 'soundbar', 'caixa som', 'projetor',
  'kindle', 'echo dot', 'air fryer', 'liquidificador', 'batedeira',
  'panela', 'jogo de panelas', 'tapete', 'cortina', 'luminaria',
  'ventilador', 'climatizador', 'umidificador', 'aspirador',
  'robo aspirador', 'purificador', 'bicicleta', 'patinete',
  'skate', 'bermuda', 'camiseta', 'jaqueta', 'calcado',
  'oculos', 'cinto', 'pulseira', 'anel', 'colar', 'brinco',
  'almofada', 'edredom', 'toalha', 'lencol', 'colchao',
  'escrivaninha', 'estante', 'armario', 'banco', 'poltrona',
  'torradeira', 'sanduicheira', 'panela eletrica', 'fritadeira',
  'chuveiro', 'torneira', 'registro', 'adaptador', 'tomada',
  'extensor', 'fio', 'cabo', 'hdmi', 'usb', 'controle',
  'volante', 'capacete', 'luva', 'mochila infantil', 'lancheira',
  'creme', 'protetor solar', 'shampoo', 'condicionador', 'sabonete',
];

const SORT_TYPES = [1, 2, 5];

async function loadCursor(): Promise<{ keywordIndex: number; sortTypeIndex: number; page: number }> {
  const row = await prisma.botCursor.findUnique({ where: { id: 'default' } });
  if (row) return { keywordIndex: row.shopeeKeywordIndex, sortTypeIndex: row.shopeeSortTypeIndex, page: row.shopeePage };
  return { keywordIndex: 0, sortTypeIndex: 0, page: 1 };
}

async function saveCursor(keywordIndex: number, sortTypeIndex: number, page: number): Promise<void> {
  await prisma.botCursor.upsert({
    where: { id: 'default' },
    update: { shopeeKeywordIndex: keywordIndex, shopeeSortTypeIndex: sortTypeIndex, shopeePage: page },
    create: { id: 'default', shopeeKeywordIndex: keywordIndex, shopeeSortTypeIndex: sortTypeIndex, shopeePage: page },
  });
}

let cursorLoaded = false;
let keywordIndex = 0;
let sortTypeIndex = 0;
let page = 1;

async function ensureCursor(): Promise<void> {
  if (!cursorLoaded) {
    const c = await loadCursor();
    keywordIndex = c.keywordIndex;
    sortTypeIndex = c.sortTypeIndex;
    page = c.page;
    cursorLoaded = true;
  }
}

async function advanceState(): Promise<{ keyword: string; sortType: number; page: number }> {
  await ensureCursor();

  const keyword = KEYWORDS[keywordIndex] ?? '';
  const sortType = SORT_TYPES[sortTypeIndex];

  page += 1;
  if (page > 20) {
    page = 1;
    sortTypeIndex += 1;
    if (sortTypeIndex >= SORT_TYPES.length) {
      sortTypeIndex = 0;
      keywordIndex += 1;
      if (keywordIndex >= KEYWORDS.length) {
        keywordIndex = 0;
        logger.info('All keyword/page combos exhausted, restarting from beginning');
      }
    }
  }

  await saveCursor(keywordIndex, sortTypeIndex, page);
  return { keyword, sortType, page };
}

function signPayload(appId: string, timestamp: number, body: string, secret: string): string {
  const baseString = `${appId}${timestamp}${body}${secret}`;
  return createHash('sha256').update(baseString).digest('hex');
}

async function graphqlRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyObj = { query, variables };
  const body = JSON.stringify(bodyObj);
  const signature = signPayload(env.SHOPEE_APP_ID, timestamp, body, env.SHOPEE_SECRET);

  const res = await fetch(env.SHOPEE_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${env.SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopee API error ${res.status}: ${text}`);
  }

  const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };

  if (json.errors) {
    throw new Error(`Shopee GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`);
  }

  return json.data as T;
}

interface ProductOfferResponse {
  productOfferV2: {
    nodes: ProductOfferNode[];
    pageInfo: { page: number; limit: number; hasNextPage: boolean };
  };
}

interface ProductOfferNode {
  itemId: number;
  productName: string;
  imageUrl?: string;
  price?: number;
  priceMin?: number;
  priceMax?: number;
  offerLink?: string;
  productLink?: string;
  shopId?: number;
  commissionRate?: string;
  commission?: string;
  sales?: number;
  shopName?: string;
  ratingStar?: number;
  priceDiscountRate?: number;
}

function requireShopeeEnv(): void {
  if (!env.SHOPEE_APP_ID || !env.SHOPEE_SECRET) {
    throw new Error('SHOPEE_APP_ID and SHOPEE_SECRET must be set in .env to fetch Shopee offers');
  }
}

/* ------------------------------------------------------------------ */
/*  Evaluation / Rating filter                                        */
/*                                                                     */
/*  Only return products with meaningful social proof.                 */
/* ------------------------------------------------------------------ */

export function hasValidRating(product: ShopeeProduct): boolean {
  return product.ratingStar != null && product.ratingStar > 0;
}

export function hasSoldProduct(product: ShopeeProduct): boolean {
  return product.soldCount != null && product.soldCount > 0;
}

export function isProductRated(product: ShopeeProduct): boolean {
  return hasValidRating(product) || hasSoldProduct(product);
}

export async function fetchOffers(limit = 20): Promise<ShopeeProduct[]> {
  requireShopeeEnv();

  const { keyword, sortType, page: p } = await advanceState();
  const variables: Record<string, unknown> = { limit, sortType, page: p };
  if (keyword) variables.keyword = keyword;

  logger.info({ keyword: keyword || '(todos)', sortType, page: p }, 'Fetching Shopee offers');

  const data = await graphqlRequest<ProductOfferResponse>(PRODUCTS_QUERY, variables);
  const nodes = data.productOfferV2?.nodes ?? [];

  const products = nodes.map(normalizeNode);

  const rated = products.filter(isProductRated);
  const skipped = products.length - rated.length;
  if (skipped > 0) {
    logger.info({ total: products.length, rated: rated.length, skipped }, 'Rating filter applied to fetch results');
  }

  return rated;
}

/* ------------------------------------------------------------------ */
/*  Affiliate node → ShopeeProduct                                    */
/*                                                                     */
/*  STRICT: ONLY extract fields that come from the affiliate API.      */
/*  NO originalPrice — that comes exclusively from scrape enrichment.  */
/*  NO productDiscountAmount — only calculated after scrape merge.     */
/*  NO hasRealDiscount — only determined after scrape merge.           */
/* ------------------------------------------------------------------ */
function normalizeNode(node: ProductOfferNode): ShopeeProduct {
  const currentPrice = Number(node.priceMin ?? node.priceMax ?? 0);

  return {
    itemId: node.itemId,
    title: node.productName,
    imageUrl: node.imageUrl ?? '',
    price: currentPrice,
    affiliateEffectivePrice: currentPrice,
    couponDiscountAmount: undefined,
    pixDiscountAmount: undefined,
    estimatedFinalPrice: node.priceMin != null ? node.priceMin : undefined,
    currency: 'BRL',
    affiliateLink: node.offerLink ?? '',
    productLink: node.productLink,
    shopId: node.shopId,
    description: undefined,
    discountRate: node.priceDiscountRate,
    commissionRate: node.commissionRate ? Math.round(Number(node.commissionRate) * 100) : undefined,
    ratingStar: node.ratingStar,
    soldCount: node.sales ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Product enrichment                                                 */
/*                                                                     */
/*  Note: Source B (Shopee product page scraping) was previously used  */
/*  to extract the crossed-out original price and shop vouchers.       */
/*  Shopee now blocks all non-browser API calls (error 90309999), and  */
/*  the affiliate GraphQL API does not expose price_before_discount.   */
/*  The bot displays the affiliate price as the source of truth.       */
/* ------------------------------------------------------------------ */

export async function enrichProduct(product: ShopeeProduct): Promise<OfferData> {
  const base: OfferData = {
    source: 'shopee',
    sourceId: String(product.itemId),
    title: product.title,
    description: product.description,
    price: product.price,
    couponDiscountAmount: undefined,
    estimatedFinalPrice: product.estimatedFinalPrice,
    currency: product.currency,
    imageUrl: product.imageUrl,
    affiliateUrl: product.affiliateLink,
    discountRate: product.discountRate,
    commissionRate: product.commissionRate,
    ratingStar: product.ratingStar,
    soldCount: product.soldCount,
  };

  logger.info(
    { itemId: product.itemId, shopId: product.shopId, price: product.price },
    'Product enriched from affiliate API data',
  );

  return base;
}
