import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../db/index.js';
import { fetchProductDetail } from './detail-client.js';
import type { ScrapeEnrichmentResult } from './detail-client.js';
import type { ShopeeProduct, OfferData } from '../../types/index.js';

const PRICE_DIVISOR = Number(env.SHOPEE_SCRAPE_PRICE_DIVISOR) || 100_000;

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
/*  Variant-aware scrape → affiliate price comparison                 */
/* ------------------------------------------------------------------ */

/** Convert Shopee integer price (e.g. 8550000 for R$85.50) to decimal */
function fromShopeePrice(raw: number | undefined | null): number | null {
  if (raw == null || raw <= 0) return null;
  return Math.round((raw / PRICE_DIVISOR) * 100) / 100;
}

function tryMatchModelByPrice(
  models: Array<{ price?: number; price_before_discount?: number; modelid: number; name?: string }>,
  targetPrice: number | null,
): { originPrice: number; currentPrice: number; model: { price?: number; price_before_discount?: number; modelid: number; name?: string } } | null {
  if (targetPrice == null || targetPrice <= 0) return null;

  const matches = models.filter((m) => {
    const mp = fromShopeePrice(m.price);
    return mp != null && Math.abs(mp - targetPrice) < 0.01;
  });

  if (matches.length === 1) {
    const originPrice = fromShopeePrice(matches[0].price_before_discount);
    const currentPrice = fromShopeePrice(matches[0].price);
    if (originPrice != null && originPrice > 0 && currentPrice != null && currentPrice > 0) {
      return { originPrice, currentPrice, model: matches[0] };
    }
  }

  if (matches.length > 1) {
    /* Multiple models share the same current price — try price_before_discount disambiguation */
    const uniqueOrigin = new Set(matches.map((m) => m.price_before_discount));
    if (uniqueOrigin.size === 1) {
      const originPrice = fromShopeePrice(matches[0].price_before_discount);
      const currentPrice = fromShopeePrice(matches[0].price);
      if (originPrice != null && originPrice > 0 && currentPrice != null && currentPrice > 0) {
        return { originPrice, currentPrice, model: matches[0] };
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  SOURCE B enrichment — merges affiliate data with scrape detail     */
/* ------------------------------------------------------------------ */

export async function enrichProduct(product: ShopeeProduct): Promise<OfferData> {
  const base: OfferData = {
    source: 'shopee',
    sourceId: String(product.itemId),
    title: product.title,
    description: product.description,
    price: product.price,
    productDiscountAmount: undefined,
    couponDiscountAmount: undefined,
    pixDiscountAmount: undefined,
    estimatedFinalPrice: product.estimatedFinalPrice,
    hasRealDiscount: false,
    currency: product.currency,
    imageUrl: product.imageUrl,
    affiliateUrl: product.affiliateLink,
    discountRate: product.discountRate,
    displayedDiscountPercent: undefined,
    commissionRate: product.commissionRate,
    ratingStar: product.ratingStar,
    soldCount: product.soldCount,
  };

  if (!product.itemId || !product.shopId) {
    logger.info({ itemId: product.itemId }, 'No itemId/shopId — cannot enrich');
    return base;
  }

  const detail = await fetchProductDetail(product.itemId, product.shopId);
  if (!detail) {
    logger.info(
      { itemId: product.itemId, shopId: product.shopId },
      'Product page scrape unavailable — posting with affiliate price only',
    );
    return base;
  }

  const hasVariants = detail.hasVariants;
  const logCtx = { itemId: product.itemId, shopId: product.shopId, hasVariants, modelCount: detail.models.length };

  /* ---- Read pricing from product page (source of truth) ---- */
  let pageOriginal: number | null = null;
  let pageCurrent: number | null = null;
  let pageOriginalSource: 'product_price_before_discount' | 'model_price_before_discount' | null = null;
  let pageCurrentSource: 'product_price' | 'model_price' | null = null;
  let exactVariantMatch = false;

  if (detail.models.length === 1) {
    /* Single model — use its prices directly */
    pageOriginal = detail.originalPrice;
    pageOriginalSource = detail.originalPriceField;
    pageCurrent = detail.currentPrice;
    pageCurrentSource = detail.currentPriceField;
  } else if (detail.models.length > 1) {
    /* Multi-model — try to match a variant by comparing model prices against detail.currentPrice */
    const matched = tryMatchModelByPrice(detail.models, detail.currentPrice);
    if (matched) {
      pageOriginal = matched.originPrice;
      pageOriginalSource = 'model_price_before_discount';
      pageCurrent = matched.currentPrice;
      pageCurrentSource = 'model_price';
      exactVariantMatch = true;
      logger.info({ ...logCtx, modelId: matched.model.modelid }, 'Exact variant match for page pricing');
    } else if (detail.allOriginPricesSame && detail.originalPrice != null && detail.currentPrice != null) {
      /* All models share same prices — safe to use aggregate */
      pageOriginal = detail.originalPrice;
      pageOriginalSource = detail.originalPriceField;
      pageCurrent = detail.currentPrice;
      pageCurrentSource = detail.currentPriceField;
      logger.info({ ...logCtx }, 'All models share same prices — using aggregate');
    } else {
      /* Can't match — ambiguous pricing; suppress discount */
      logger.info(
        { ...logCtx },
        'Multi-variant product — cannot resolve variant pricing; suppressing discount',
      );
    }
  } else {
    /* No models — use top-level fallback */
    pageOriginal = detail.originalPrice;
    pageOriginalSource = detail.originalPriceField;
    pageCurrent = detail.currentPrice;
    pageCurrentSource = detail.currentPriceField;
  }

  /* ---- Apply page pricing to OfferData ---- */
  const hasRealDiscount =
    pageOriginal != null &&
    base.price != null &&
    base.price > 0 &&
    pageOriginal > base.price;

  const productDiscountAmount: number | undefined = undefined;

  base.originalPrice = pageOriginal ?? undefined;
  base.originalPriceSource = pageOriginalSource ?? undefined;
  base.displayedDiscountPercent = detail.displayedDiscountPercent ?? undefined;
  base.scrapeHasVariants = hasVariants || (detail.models.length > 1) || undefined;
  base.scrapeExactVariantMatch = exactVariantMatch || undefined;
  base.productDiscountAmount = productDiscountAmount;
  base.hasRealDiscount = hasRealDiscount;

  /* ---- Coupon from scrape ---- */
  if (detail.hasReliableShopCoupon) {
    base.couponDiscountAmount = detail.couponDiscountValue ?? undefined;
  }

  logger.info(
    {
      ...logCtx,
      pageOriginal,
      pageCurrent,
      pageOriginalSource,
      pageCurrentSource,
      exactVariantMatch,
      pageDiscountBadge: detail.displayedDiscountPercent,
      hasRealDiscount,
      productDiscountAmount,
      hasReliableShopCoupon: detail.hasReliableShopCoupon,
      couponDiscountValue: detail.couponDiscountValue,
    },
    'Scrape enrichment merged — page pricing applied',
  );

  return base;
}

export { fetchProductDetail } from './detail-client.js';
