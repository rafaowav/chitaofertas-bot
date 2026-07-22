import { prisma } from '../../db/index.js';
import { logger } from '../../lib/logger.js';
import { searchProducts } from '../shopee/index.js';
import { notifyPriceDrop } from '../offers/index.js';
import { env } from '../../config/env.js';
import type { OfferData } from '../../types/index.js';

interface PriceCheckResult {
  checked: number;
  dropsNotified: number;
  notFound: number;
}

export async function checkPriceDrops(): Promise<PriceCheckResult> {
  const batchSize = Number(env.PRICE_CHECK_BATCH_SIZE) || 20;
  const thresholdPct = Number(env.PRICE_DROP_THRESHOLD) || 5;
  const minAmount = Number(env.PRICE_DROP_MIN_AMOUNT) || 5;

  const offers = await prisma.offer.findMany({
    where: { posted: true },
    orderBy: { lastPriceCheckAt: { sort: 'asc', nulls: 'first' } },
    take: batchSize,
  });

  if (offers.length === 0) {
    logger.debug('No posted offers to check for price drops');
    return { checked: 0, dropsNotified: 0, notFound: 0 };
  }

  logger.info({ count: offers.length }, 'Checking prices for posted offers');

  let dropsNotified = 0;
  let notFound = 0;

  for (const offer of offers) {
    try {
      const sourceId = offer.sourceId;
      const itemId = Number(sourceId);

      if (isNaN(itemId)) {
        await touchCheckTime(offer.id);
        continue;
      }

      const results = await searchProducts(offer.title, 5);
      const match = results.find((p) => p.itemId === itemId);

      if (!match) {
        notFound++;
        await touchCheckTime(offer.id);
        continue;
      }

      const currentPrice = match.price;
      const baselinePrice = offer.lastNotifiedDropPrice ?? offer.price;

      if (
        baselinePrice != null &&
        currentPrice != null &&
        currentPrice > 0 &&
        currentPrice < baselinePrice
      ) {
        const dropPct = ((baselinePrice - currentPrice) / baselinePrice) * 100;
        const dropAmount = baselinePrice - currentPrice;

        if (dropPct >= thresholdPct && dropAmount >= minAmount) {
          const offerData: OfferData = {
            source: offer.source as 'shopee' | 'amazon',
            sourceId: offer.sourceId,
            title: offer.title,
            description: offer.description ?? undefined,
            price: currentPrice,
            currency: offer.currency ?? undefined,
            imageUrl: offer.imageUrl ?? undefined,
            affiliateUrl: offer.affiliateUrl,
            discountRate: offer.discountRate ?? undefined,
            commissionRate: offer.commissionRate ?? undefined,
            ratingStar: offer.ratingStar ?? undefined,
            soldCount: offer.soldCount ?? undefined,
          };

          const notified = await notifyPriceDrop(offerData, baselinePrice, dropAmount, dropPct);
          if (notified) {
            dropsNotified++;
            await prisma.offer.update({
              where: { id: offer.id },
              data: {
                lastNotifiedDropPrice: currentPrice,
                lastNotifiedDropAt: new Date(),
                lastPriceCheckAt: new Date(),
                price: currentPrice,
              },
            });
          } else {
            await touchCheckTime(offer.id);
          }
        } else {
          await touchCheckTime(offer.id);
        }
      } else {
        await touchCheckTime(offer.id);
      }
    } catch (err) {
      logger.error({ err, offerId: offer.id, title: offer.title }, 'Price check failed for offer');
    }
  }

  logger.info(
    { checked: offers.length, dropsNotified, notFound },
    'Price check cycle completed',
  );

  return { checked: offers.length, dropsNotified, notFound };
}

async function touchCheckTime(offerId: string): Promise<void> {
  await prisma.offer.update({
    where: { id: offerId },
    data: { lastPriceCheckAt: new Date() },
  });
}
