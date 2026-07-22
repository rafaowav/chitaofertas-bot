import { logger } from '../../lib/logger.js';
import { searchProducts, filterRelevantProducts, enrichProduct } from '../shopee/index.js';
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

const MAX_DM_RESULTS = 3;

/* ───────── Webhook entry point ───────── */

export async function handleUpdate(body: unknown): Promise<void> {
  const update = body as TelegramUpdate;
  if (!update?.message) return;

  const msg = update.message;
  const chatType = msg.chat.type;
  const chatId = msg.chat.id;
  const text = (msg.text ?? '').trim();
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
  try {
    const products = await searchProducts(keyword);
    if (products.length === 0) {
      await replyToMessage(chatId, `Nenhum produto encontrado para "${keyword}". Tente outro termo.`, replyToMsgId);
      return;
    }

    const filtered = filterRelevantProducts(products, keyword);

    const selected: Array<{ title: string; price: number; ratingStar?: number; soldCount?: number; affiliateLink: string }> = [];

    for (const product of filtered) {
      if (selected.length >= MAX_DM_RESULTS) break;
      const sourceId = String(product.itemId);
      const canPost = await canPostOrUpdate('shopee', sourceId, product.price, product.title);
      if (!canPost) continue;
      selected.push({
        title: product.title,
        price: product.price,
        ratingStar: product.ratingStar,
        soldCount: product.soldCount,
        affiliateLink: product.affiliateLink,
      });
    }

    if (selected.length === 0) {
      await replyToMessage(chatId, `Esses produtos já foram encontrados recentemente. Tente outro termo.`, replyToMsgId);
      return;
    }

    const lines: string[] = [];
    lines.push(`🔍 <b>Resultados para "${keyword}"</b>`);
    lines.push('');

    const emojis = ['1️⃣', '2️⃣', '3️⃣'];
    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      lines.push(`${emojis[i]} <b>${item.title}</b>`);
      lines.push(`💰 <b>R$ ${item.price.toFixed(2)}</b>`);
      const rating = item.ratingStar != null ? `${item.ratingStar.toFixed(1)}` : '?';
      const sold = item.soldCount != null ? `${item.soldCount.toLocaleString('pt-BR')} vendidos` : '';
      lines.push(`⭐ ${rating} estrelas${sold ? ` | 📦 ${sold}` : ''}`);
      lines.push(`🔗 ${item.affiliateLink}`);
      if (i < selected.length - 1) lines.push('');
    }

    if (selected.length > 0) {
      lines.push('');
      lines.push('💳 Mais desconto com Pix');
      lines.push('🎟️ Mais desconto usando cupom da loja');
    }

    const text = lines.join('\n');
    await replyToMessage(chatId, text, replyToMsgId);
  } catch (err) {
    logger.error({ err, keyword }, 'Search failed for user');
    await replyToMessage(chatId, `Erro ao buscar "${keyword}". Tente novamente mais tarde.`, replyToMsgId);
  }
}
