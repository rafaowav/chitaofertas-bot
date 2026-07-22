import { prisma } from '../../db/index.js';
import { logger } from '../../lib/logger.js';
import { offerHash } from '../../lib/hash.js';
import { nowISO } from '../../lib/utils.js';
import type { AmazonOfferInput, OfferData } from '../../types/index.js';

export async function addAmazonOffer(input: AmazonOfferInput): Promise<OfferData> {
  const sourceId = `amzn_manual_${nowISO()}`;
  const hash = offerHash('amazon', sourceId);

  const existing = await prisma.offer.findUnique({ where: { hash } });
  if (existing) {
    throw new Error('Duplicate offer detected');
  }

  const offer = await prisma.offer.create({
    data: {
      source: 'amazon',
      sourceId,
      title: input.title,
      description: input.description,
      price: input.price ?? null,
      couponDiscountAmount: input.couponDiscountAmount ?? null,
      estimatedFinalPrice: input.estimatedFinalPrice ?? null,
      currency: input.currency ?? 'BRL',
      imageUrl: input.imageUrl,
      affiliateUrl: input.affiliateUrl,
      hash,
      posted: false,
    },
  });

  logger.info({ id: offer.id, title: offer.title }, 'Amazon offer saved');

  return {
    source: 'amazon',
    sourceId: offer.sourceId,
    title: offer.title,
    description: offer.description ?? undefined,
    price: offer.price ?? undefined,
    couponDiscountAmount: offer.couponDiscountAmount ?? undefined,
    estimatedFinalPrice: offer.estimatedFinalPrice ?? undefined,
    currency: offer.currency ?? undefined,
    imageUrl: offer.imageUrl ?? undefined,
    affiliateUrl: offer.affiliateUrl,
  };
}

export async function getPendingAmazonOffers(): Promise<OfferData[]> {
  const offers = await prisma.offer.findMany({
    where: { source: 'amazon', posted: false },
    orderBy: { createdAt: 'asc' },
  });

  return offers.map((o) => ({
    source: 'amazon' as const,
    sourceId: o.sourceId,
    title: o.title,
    description: o.description ?? undefined,
    price: o.price ?? undefined,
    couponDiscountAmount: o.couponDiscountAmount ?? undefined,
    estimatedFinalPrice: o.estimatedFinalPrice ?? undefined,
    currency: o.currency ?? undefined,
    imageUrl: o.imageUrl ?? undefined,
    affiliateUrl: o.affiliateUrl,
  }));
}
