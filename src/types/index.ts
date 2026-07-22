/* ------------------------------------------------------------------ */
/*  Pricing model — every field comes from a real source, never       */
/*  calculated / inferred / reverse-engineered.                       */
/* ------------------------------------------------------------------ */

export interface OfferData {
  source: 'shopee' | 'amazon';
  sourceId: string;
  title: string;
  description?: string;

  /* ---- Core pricing ---- */
  /** Current selling price — from Shopee Affiliate API (priceMin) */
  price?: number;
  /** Store-coupon discount */
  couponDiscountAmount?: number;
  /** Estimated final checkout price — priceMin from Shopee Affiliate API */
  estimatedFinalPrice?: number;

  currency?: string;
  imageUrl?: string;
  affiliateUrl: string;

  /** priceDiscountRate from Shopee Affiliate API (percentage, e.g. 47) */
  discountRate?: number;
  commissionRate?: number;

  /** Rating star (0-5) from Shopee Affiliate API */
  ratingStar?: number;
  /** Number of items sold */
  soldCount?: number;
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
  couponDiscountAmount?: number;
  estimatedFinalPrice?: number;
  currency?: string;
  imageUrl?: string;
  affiliateUrl: string;
}

export interface ServiceHealth {
  name: string;
  status: 'ok' | 'error';
  message?: string;
}
