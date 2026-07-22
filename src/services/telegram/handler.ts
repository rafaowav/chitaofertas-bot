import { logger } from '../../lib/logger.js';
import { searchProducts, enrichProduct, isProductRated } from '../shopee/index.js';
import { canPostOrUpdate } from '../offers/index.js';
import { replyToMessage, sendMessageToChat } from './index.js';

/* ───────── Types ───────── */

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: 'private' | 'group' | 'supergroup' | 'channel' };
    text?: string;
  };
}

/* ───────── Webhook entry point ───────── */

export async function handleUpdate(body: unknown): Promise<void> {
  const update = body as TelegramUpdate;
  if (!update?.message) return;

  const msg = update.message;
  const chatType = msg.chat.type;
  const chatId = msg.chat.id;
  const text = (msg.text ?? '').trim();
  const userId = msg.from?.id;
  const userName = msg.from?.first_name ?? 'Usuário';

  if (chatType !== 'private') return; /* only respond in DMs */

  if (!text) {
    await replyToMessage(chatId, 'Envie um termo de busca para encontrar produtos na Shopee. Ex: "fone bluetooth"', msg.message_id);
    return;
  }

  if (text.startsWith('/start')) {
    await sendMessageToChat(chatId, `Olá ${userName}! 👋\n\nEnvie um termo de busca (ex: "celular", "fone", "tv") que eu procuro ofertas na Shopee para você.\n\nPosso buscar em diversas categorias e nichos.`);
    return;
  }

  if (text.startsWith('/')) return; /* ignore other commands */

  await handleSearch(chatId, text, msg.message_id);
}

/* ───────── Search flow ───────── */

async function handleSearch(chatId: number, keyword: string, replyToMsgId: number): Promise<void> {
  const source = 'shopee';

  try {
    const products = await searchProducts(keyword);
    if (products.length === 0) {
      await replyToMessage(chatId, `Nenhum produto encontrado para "${keyword}". Tente outro termo.`, replyToMsgId);
      return;
    }

    const product = products[0];
    const sourceId = String(product.itemId);

    const canPost = await canPostOrUpdate(source, sourceId, product.price, product.title);
    if (!canPost) {
      await replyToMessage(chatId, `Esse produto já foi encontrado recentemente. Tente outro.`, replyToMsgId);
      return;
    }

    const enriched = await enrichProduct(product);

    const lines: string[] = [];
    lines.push('🔍 <b>Produto encontrado!</b>');
    lines.push('');
    lines.push(`<b>${product.title}</b>`);
    lines.push('');
    if (product.price) {
      lines.push(`💰 Preço: <b>R$ ${product.price.toFixed(2)}</b>`);
    }
    lines.push('');
    lines.push(`⭐ ${product.ratingStar ?? '?'} estrelas`);
    if (product.soldCount) {
      lines.push(`📦 ${product.soldCount} vendidos`);
    }
    lines.push('');
    lines.push(`💳 Mais desconto com Pix`);
    lines.push(`🎟️ Mais desconto usando cupom da loja`);
    lines.push('');
    lines.push(`<b>LINK ✅</b> ${product.affiliateLink}`);

    const text = lines.join('\n');
    await replyToMessage(chatId, text, replyToMsgId);
  } catch (err) {
    logger.error({ err, keyword }, 'Search failed for user');
    await replyToMessage(chatId, `Erro ao buscar "${keyword}". Tente novamente mais tarde.`, replyToMsgId);
  }
}
