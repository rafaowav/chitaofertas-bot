import { prisma } from '../../db/index.js';
import { logger } from '../../lib/logger.js';
import { offerHash, titleHash } from '../../lib/hash.js';
import { formatPrice, truncate } from '../../lib/utils.js';
import { sendTelegramPost } from '../telegram/index.js';
import { env } from '../../config/env.js';
import type { OfferData, TelegramMessage } from '../../types/index.js';

export function buildTelegramMessage(offer: OfferData): TelegramMessage {
  const lines: string[] = [];

  /* ---- Show price from affiliate API ---- */
  if (offer.price != null && offer.price > 0) {
    lines.push('🔥 PRODUTO ENCONTRADO');
    lines.push('');
    lines.push(`<b>${truncate(offer.title, 200)}</b>`);
    lines.push('');
    lines.push(`💰 Preço: <b>${formatPrice(offer.price, offer.currency)}</b>`);
  } else {
    lines.push('🔥 PRODUTO ENCONTRADO');
    lines.push('');
    lines.push(`<b>${truncate(offer.title, 200)}</b>`);
  }

  /* ---- Discount lines ---- */
  lines.push('');
  lines.push('💳 Mais desconto com Pix');
  lines.push('🎟️ Mais desconto usando cupom da loja');

  lines.push('');
  lines.push(`<i>Via Shopee</i>`);
  lines.push('');
  lines.push(`<b>LINK ✅</b> ${offer.affiliateUrl}`);

  return { text: lines.join('\n'), imageUrl: offer.imageUrl, buttonUrl: '', buttonLabel: '' };
}

export async function postOffer(offer: OfferData): Promise<boolean> {
  const msg = buildTelegramMessage(offer);
  const ok = await sendTelegramPost(env.TELEGRAM_CHAT_ID, msg);

  if (ok) {
    const hash = offerHash(offer.source, offer.sourceId);
    const data = {
      title: offer.title,
      description: offer.description ?? null,
      price: offer.price ?? null,
      originalPrice: offer.originalPrice ?? null,
      productDiscountAmount: offer.productDiscountAmount ?? null,
      couponDiscountAmount: offer.couponDiscountAmount ?? null,
      pixDiscountAmount: offer.pixDiscountAmount ?? null,
      estimatedFinalPrice: offer.estimatedFinalPrice ?? null,
      hasRealDiscount: offer.hasRealDiscount ?? null,
      currency: offer.currency ?? null,
      imageUrl: offer.imageUrl ?? null,
      affiliateUrl: offer.affiliateUrl,
      discountRate: offer.discountRate ?? null,
      displayedDiscountPercent: offer.displayedDiscountPercent ?? null,
      commissionRate: offer.commissionRate ?? null,
      ratingStar: offer.ratingStar ?? null,
      soldCount: offer.soldCount ?? null,
      originalPriceSource: offer.originalPriceSource ?? null,
      scrapeHasVariants: offer.scrapeHasVariants ?? null,
      scrapeExactVariantMatch: offer.scrapeExactVariantMatch ?? null,
      posted: true,
      postedAt: new Date(),
    };
    const dataWithTitleHash = { ...data, titleHash: titleHash(offer.title) };
    await prisma.offer.upsert({
      where: { hash },
      update: dataWithTitleHash,
      create: { ...dataWithTitleHash, source: offer.source, sourceId: offer.sourceId, hash },
    });
    logger.info({ source: offer.source, title: offer.title }, 'Offer posted');
  } else {
    logger.error({ source: offer.source, title: offer.title }, 'Failed to post offer');
  }

  return ok;
}

export async function canPostOrUpdate(source: string, sourceId: string, _newPrice?: number, offerTitle?: string): Promise<boolean> {
  const hash = offerHash(source, sourceId);
  const existing = await prisma.offer.findUnique({ where: { hash } });
  if (existing) return false;

  if (offerTitle) {
    const tHash = titleHash(offerTitle);
    const sameTitle = await prisma.offer.findFirst({ where: { titleHash: tHash } });
    if (sameTitle) return false;
  }

  return true;
}
