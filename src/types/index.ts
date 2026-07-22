/* ------------------------------------------------------------------ */
/*  Pricing model — every field comes from a real source, never       */
/*  calculated / inferred / reverse-engineered.                       */
/* ------------------------------------------------------------------ */

export interface OfferData {
  source: 'shopee' | 'amazon';
  sourceId: string;
  title: string;
  description?: string;

  /* ---- Core pricing (real source fields only) ---- */
  /** Current selling price — from Shopee Affiliate API (priceMin) */
  price?: number;
  /** Real original crossed-out price — from Shopee product page scrape only */
  originalPrice?: number;
  /** originalPrice - price when both are real and original > price */
  productDiscountAmount?: number;
  /** Store-coupon discount */
  couponDiscountAmount?: number;
  /** Pix / payment-method discount */
  pixDiscountAmount?: number;
  /** Estimated final checkout price — priceMin from Shopee Affiliate API */
  estimatedFinalPrice?: number;
  /** True when originalPrice exists and is strictly > affiliate price */
  hasRealDiscount?: boolean;

  currency?: string;
  imageUrl?: string;
  affiliateUrl: string;

  /** priceDiscountRate from Shopee Affiliate API (percentage, e.g. 47 = 47%).
   *  Stored for reference but NEVER used to derive originalPrice. */
  discountRate?: number;
  /** Discount badge/percentage from the product page (e.g. 57 for 57%).
   *  Where available, this is the page-displayed value — not calculated. */
  displayedDiscountPercent?: number;
  commissionRate?: number;

  /** Rating star (0-5) from Shopee Affiliate API */
  ratingStar?: number;
  /** Number of items sold */
  soldCount?: number;

  /* ---- Scrape enrichment metadata ---- */
  /** Which field from the product page supplied originalPrice */
  originalPriceSource?: 'product_price_before_discount' | 'model_price_before_discount';
  /** Product has multiple models/variants */
  scrapeHasVariants?: boolean;
  /** Could match affiliate price to a specific model/variant */
  scrapeExactVariantMatch?: boolean;
}

export interface TelegramMessage {
  text: string;
  imageUrl?: string;
  buttonUrl: string;
  buttonLabel?: string;
}

export interface ShopeeProduct {
  itemId: number;
  title: string;
  imageUrl: string;

  /** priceMin from Shopee Affiliate API (minimum selling price across variations) */
  price: number;
  /** price — same as price (kept for clarity) */
  affiliateEffectivePrice: number;

  /** Coupon discount — not exposed by this API */
  couponDiscountAmount?: undefined;
  /** Pix discount — not exposed by this API */
  pixDiscountAmount?: undefined;
  /** priceMin doubles as estimated final price */
  estimatedFinalPrice?: number;

  currency: string;
  affiliateLink: string;
  productLink?: string;
  shopId?: number;
  description?: string;
  /** Raw priceDiscountRate from API (percentage, e.g. 47) — NEVER for originalPrice */
  discountRate?: number;
  commissionRate?: number;

  /** Rating star (0-5) from Shopee Affiliate API */
  ratingStar?: number;
  /** Number of items sold */
  soldCount?: number;
}

export interface AmazonOfferInput {
  title: string;
  description?: string;
  price?: number;
  originalPrice?: number;
  productDiscountAmount?: number;
  couponDiscountAmount?: number;
  pixDiscountAmount?: number;
  estimatedFinalPrice?: number;
  hasRealDiscount?: boolean;
  currency?: string;
  imageUrl?: string;
  affiliateUrl: string;
}

export interface ServiceHealth {
  name: string;
  status: 'ok' | 'error';
  message?: string;
}
