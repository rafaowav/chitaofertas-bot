import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import type { TelegramMessage } from '../../types/index.js';

const TELEGRAM_API = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

export type ParseMode = 'HTML' | 'MarkdownV2' | 'Markdown';

interface SendPhotoResult {
  ok: boolean;
  description?: string;
}

export async function sendTelegramPost(chatId: string, msg: TelegramMessage): Promise<boolean> {
  if (msg.imageUrl) {
    return sendPhoto(chatId, msg);
  }
  return sendMessage(chatId, msg);
}

async function sendPhoto(chatId: string, msg: TelegramMessage): Promise<boolean> {
  const url = `${TELEGRAM_API}/sendPhoto`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    photo: msg.imageUrl,
    caption: msg.text,
    parse_mode: 'HTML' as ParseMode,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as SendPhotoResult;
    if (!data.ok) {
      logger.error({ err: data.description }, 'Telegram sendPhoto failed');
      return false;
    }
    logger.info('Photo sent to Telegram');
    return true;
  } catch (err) {
    logger.error({ err }, 'Telegram sendPhoto error');
    return false;
  }
}

async function sendMessage(chatId: string, msg: TelegramMessage): Promise<boolean> {
  const url = `${TELEGRAM_API}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: msg.text,
    parse_mode: 'HTML' as ParseMode,
    disable_web_page_preview: false,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as SendPhotoResult;
    if (!data.ok) {
      logger.error({ err: data.description }, 'Telegram sendMessage failed');
      return false;
    }
    logger.info('Message sent to Telegram');
    return true;
  } catch (err) {
    logger.error({ err }, 'Telegram sendMessage error');
    return false;
  }
}
