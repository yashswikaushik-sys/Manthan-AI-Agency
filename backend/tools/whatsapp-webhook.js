'use strict';

require('dotenv').config();
const { getDb } = require('../memory/db');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'manthan_webhook_verify';

/**
 * Handle GET request for WhatsApp webhook verification (hub.challenge).
 * Meta sends a GET with hub.mode, hub.verify_token, hub.challenge.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[whatsapp-webhook] Webhook verified successfully');
      return res.status(200).send(challenge);
    }
    console.warn('[whatsapp-webhook] Webhook verification failed — token mismatch');
    return res.status(403).json({ error: 'Verification token mismatch' });
  }

  return res.status(400).json({ error: 'Missing hub.mode or hub.verify_token' });
}

/**
 * Extract message data from a Meta WhatsApp Cloud API webhook payload.
 * @param {Object} payload - Raw webhook body from Meta
 * @returns {{ from: string, message_text: string, timestamp: number, messageId: string, type: string } | null}
 */
function extractMessageFromPayload(payload) {
  try {
    const entry = payload?.entry?.[0];
    if (!entry) return null;

    const change = entry?.changes?.[0];
    if (!change || change.field !== 'messages') return null;

    const value = change.value;
    const messages = value?.messages;
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const msg = messages[0];
    const messageId = msg.id || '';
    const from = msg.from || '';
    const timestamp = parseInt(msg.timestamp || '0', 10);
    const type = msg.type || 'unknown';

    let message_text = '';
    if (type === 'text') {
      message_text = msg.text?.body || '';
    } else if (type === 'button') {
      message_text = msg.button?.text || msg.button?.payload || '';
    } else if (type === 'interactive') {
      message_text = msg.interactive?.button_reply?.title
        || msg.interactive?.list_reply?.title
        || '';
    } else if (type === 'image' || type === 'video' || type === 'audio' || type === 'document') {
      message_text = `[${type.toUpperCase()} message received]`;
    } else {
      message_text = `[${type} message — not text]`;
    }

    // Extract contact profile name if available
    const contactName = value?.contacts?.[0]?.profile?.name || '';

    return {
      from,
      message_text,
      timestamp,
      messageId,
      type,
      contactName,
      phoneNumberId: value?.metadata?.phone_number_id || '',
      displayPhoneNumber: value?.metadata?.display_phone_number || ''
    };
  } catch (err) {
    console.error('[whatsapp-webhook] Failed to extract message from payload:', err.message);
    return null;
  }
}

/**
 * Process an inbound WhatsApp webhook event.
 * Stores the event in the webhook_events table and returns the parsed message.
 * @param {Object} payload - Raw Meta webhook body
 * @returns {{ from: string, message_text: string, timestamp: number, messageId: string, eventId: number } | null}
 */
async function processInbound(payload) {
  let parsedEvent = null;

  try {
    const db = getDb();

    // Store raw event first regardless of parsing success
    const insertStmt = db.prepare(`
      INSERT INTO webhook_events (source, event_type, payload, processed, created_at)
      VALUES ('whatsapp', ?, ?, 0, CURRENT_TIMESTAMP)
    `);

    const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);

    // Determine event type from payload
    let eventType = 'unknown';
    const entryChanges = payload?.entry?.[0]?.changes?.[0];
    if (entryChanges?.value?.messages?.length > 0) {
      eventType = `message_${entryChanges.value.messages[0]?.type || 'text'}`;
    } else if (entryChanges?.value?.statuses?.length > 0) {
      const statusEntry = entryChanges.value.statuses[0];
      eventType = `status_${statusEntry.status || 'update'}`;
    }

    const insertResult = insertStmt.run(eventType, rawPayload);
    const eventId = insertResult.lastInsertRowid;

    // Parse message content
    const parsed = extractMessageFromPayload(payload);

    if (parsed) {
      parsedEvent = {
        ...parsed,
        eventId,
        receivedAt: new Date().toISOString()
      };

      // Mark as processed
      db.prepare(`
        UPDATE webhook_events
        SET processed = 1, processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(eventId);
    } else if (eventType.startsWith('status_')) {
      // Status updates (delivered, read, sent) are expected — not an error
      db.prepare(`
        UPDATE webhook_events
        SET processed = 1, processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(eventId);
    } else {
      // Could not parse — log for investigation
      db.prepare(`
        UPDATE webhook_events
        SET error = 'Could not extract message from payload'
        WHERE id = ?
      `).run(eventId);
    }

    return parsedEvent;
  } catch (err) {
    console.error('[whatsapp-webhook] processInbound error:', err.message);
    return null;
  }
}

module.exports = { verifyWebhook, processInbound };
