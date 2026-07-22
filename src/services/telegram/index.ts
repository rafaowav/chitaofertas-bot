import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import type { TelegramMessage } from '../../types/index.js';

const TELEGRAM_API = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

export type ParseMode = 'HTML' | 'MarkdownV2' | 'Markdown';

/* ───────── Webhook ───────── */

export async function setWebhook(url: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, allowed_updates: ['message'] }),
  });
  const data = await res.json();
  if (!data.ok) {
    logger.error({ err: data.description }, 'Failed to set Telegram webhook');
  } else {
    logger.info({ webhookUrl: url }, 'Telegram webhook registered');
  }
}

/* ───────── Send message (to any chat) ───────── */

export async function sendMessageToChat(chatId: string | number, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: false }),
    });
    const data = await res.json();
    if (!data.ok) {
      logger.error({ err: data.description }, 'Telegram sendMessage failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, 'Telegram sendMessage error');
    return false;
  }
}

/* ───────── Reply to a message ───────── */

export async function replyToMessage(chatId: string | number, text: string, replyToMessageId?: number): Promise<boolean> {
  try {
    const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: false };
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) {
      logger.error({ err: data.description }, 'Telegram reply failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, 'Telegram reply error');
    return false;
  }
}

/* ───────── Reply with photo ───────── */

export async function replyWithPhoto(chatId: string | number, photoUrl: string, caption: string, replyToMessageId?: number): Promise<boolean> {
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: 'HTML',
    };
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
    const res = await fetch(`${TELEGRAM_API}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json() as SendPhotoResult;
    if (!data.ok) {
      logger.error({ err: data.description }, 'Telegram replyWithPhoto failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, 'Telegram replyWithPhoto error');
    return false;
  }
}

/* ───────── Existing send functions (unchanged) ───────── */

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
