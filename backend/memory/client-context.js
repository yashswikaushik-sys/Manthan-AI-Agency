'use strict';

const { getDb } = require('./db');

/**
 * Get the full context for a client by ID.
 * @param {string} clientId
 * @returns {Object|null}
 */
function getClientContext(clientId) {
  if (!clientId) throw new Error('[client-context] clientId is required');

  const db = getDb();
  const row = db.prepare(`
    SELECT
      id, name, brand_name as brandName, industry, tone,
      channels, rate_card as rateCard, brand_gradient as brandGradient,
      airtable_record_id as airtableRecordId, notion_page_id as notionPageId,
      whatsapp_number as whatsappNumber, context_md as contextMd,
      mind_map_data as mindMapData, health_score as healthScore,
      health_computed_at as healthComputedAt,
      created_at as createdAt, updated_at as updatedAt
    FROM client_contexts
    WHERE id = ?
  `).get(String(clientId));

  if (!row) return null;

  return deserializeClient(row);
}

/**
 * Upsert client context data.
 * @param {Object} clientData
 * @param {string} clientData.id
 * @param {string} clientData.name
 * @param {string} [clientData.brand_name]
 * @param {string} [clientData.industry]
 * @param {string} [clientData.tone]
 * @param {string|string[]} [clientData.channels]
 * @param {Object|string} [clientData.rate_card]
 * @param {string} [clientData.brand_gradient]
 * @param {string} [clientData.whatsapp_number]
 * @param {string} [clientData.context_md]
 * @param {Object|string} [clientData.mind_map_data]
 */
function setClientContext(clientData) {
  if (!clientData) throw new Error('[client-context] clientData is required');
  if (!clientData.id) throw new Error('[client-context] clientData.id is required');
  if (!clientData.name) throw new Error('[client-context] clientData.name is required');

  const db = getDb();

  const channels = serializeField(clientData.channels);
  const rateCard = serializeField(clientData.rate_card);
  const mindMapData = serializeField(clientData.mind_map_data) || '{}';

  db.prepare(`
    INSERT INTO client_contexts (
      id, name, brand_name, industry, tone,
      channels, rate_card, brand_gradient,
      airtable_record_id, notion_page_id,
      whatsapp_number, context_md, mind_map_data,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      brand_name = COALESCE(excluded.brand_name, brand_name),
      industry = COALESCE(excluded.industry, industry),
      tone = COALESCE(excluded.tone, tone),
      channels = COALESCE(excluded.channels, channels),
      rate_card = COALESCE(excluded.rate_card, rate_card),
      brand_gradient = COALESCE(excluded.brand_gradient, brand_gradient),
      airtable_record_id = COALESCE(excluded.airtable_record_id, airtable_record_id),
      notion_page_id = COALESCE(excluded.notion_page_id, notion_page_id),
      whatsapp_number = COALESCE(excluded.whatsapp_number, whatsapp_number),
      context_md = COALESCE(excluded.context_md, context_md),
      mind_map_data = COALESCE(excluded.mind_map_data, mind_map_data),
      updated_at = CURRENT_TIMESTAMP
  `).run(
    String(clientData.id),
    String(clientData.name),
    clientData.brand_name ? String(clientData.brand_name) : null,
    clientData.industry ? String(clientData.industry) : null,
    clientData.tone ? String(clientData.tone) : null,
    channels,
    rateCard,
    clientData.brand_gradient ? String(clientData.brand_gradient) : null,
    clientData.airtable_record_id ? String(clientData.airtable_record_id) : null,
    clientData.notion_page_id ? String(clientData.notion_page_id) : null,
    clientData.whatsapp_number ? String(clientData.whatsapp_number) : null,
    clientData.context_md ? String(clientData.context_md) : null,
    mindMapData
  );
}

/**
 * Get all clients from the context store.
 * @returns {Array<Object>}
 */
function getAllClients() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      id, name, brand_name as brandName, industry, tone,
      channels, rate_card as rateCard, brand_gradient as brandGradient,
      airtable_record_id as airtableRecordId, notion_page_id as notionPageId,
      whatsapp_number as whatsappNumber, context_md as contextMd,
      mind_map_data as mindMapData, health_score as healthScore,
      health_computed_at as healthComputedAt,
      created_at as createdAt, updated_at as updatedAt
    FROM client_contexts
    ORDER BY name ASC
  `).all();

  return rows.map(deserializeClient);
}

/**
 * Update the health score for a client directly.
 * @param {string} clientId
 * @param {number} score - 0 to 100
 */
function updateHealthScore(clientId, score) {
  if (!clientId) throw new Error('[client-context] clientId is required');

  const db = getDb();
  const safeScore = Math.max(0, Math.min(100, Math.round(parseFloat(score) || 0)));

  db.prepare(`
    UPDATE client_contexts
    SET health_score = ?, health_computed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(safeScore, String(clientId));
}

/**
 * Compute a health score (0-100) for a client based on recent activity signals.
 *
 * Scoring rubric (100 points total):
 *   - Deliverables completed in last 30 days (up to 30 pts): 5 pts each, max 6
 *   - Approvals pending < 3 (10 pts) or >= 3 (0 pts)
 *   - Invoices paid on time (up to 25 pts): 5 pts per paid invoice in last 60 days, max 5
 *   - Last activity within 7 days (20 pts), 14 days (15 pts), 30 days (10 pts), else 0
 *   - Context completeness: brand profile filled (15 pts)
 *
 * @param {string} clientId
 * @returns {number} 0-100
 */
function computeHealthScore(clientId) {
  if (!clientId) throw new Error('[client-context] clientId is required');

  const db = getDb();
  let score = 0;

  // 1. Recent deliverables completed (max 30 pts)
  try {
    const delivResult = db.prepare(`
      SELECT COUNT(*) as cnt FROM deliverables
      WHERE client_id = ?
        AND status IN ('approved', 'published')
        AND updated_at >= datetime('now', '-30 days')
    `).get(String(clientId));

    const completedCount = delivResult?.cnt || 0;
    score += Math.min(30, completedCount * 5);
  } catch {
    // deliverables table may be empty or not yet created for this client
  }

  // 2. Pending approvals (10 pts if < 3 pending, 0 if >= 3)
  try {
    const approvalResult = db.prepare(`
      SELECT COUNT(*) as cnt FROM approvals
      WHERE client_id = ? AND status = 'pending'
    `).get(String(clientId));

    const pendingApprovals = approvalResult?.cnt || 0;
    if (pendingApprovals < 3) score += 10;
  } catch {
    score += 5; // neutral if can't determine
  }

  // 3. Paid invoices in last 60 days (max 25 pts)
  try {
    const invoiceResult = db.prepare(`
      SELECT COUNT(*) as cnt FROM invoices
      WHERE client_id = ?
        AND status = 'paid'
        AND paid_date >= date('now', '-60 days')
    `).get(String(clientId));

    const paidCount = invoiceResult?.cnt || 0;
    score += Math.min(25, paidCount * 5);
  } catch {
    // invoices table may not have entries for this client
  }

  // 4. Last activity recency (max 20 pts)
  try {
    const activityResult = db.prepare(`
      SELECT MAX(updated_at) as lastActivity FROM deliverables
      WHERE client_id = ?
    `).get(String(clientId));

    if (activityResult?.lastActivity) {
      const lastActivity = new Date(activityResult.lastActivity);
      const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceActivity <= 7) score += 20;
      else if (daysSinceActivity <= 14) score += 15;
      else if (daysSinceActivity <= 30) score += 10;
      // else 0
    }
  } catch {
    // no deliverable data
  }

  // 5. Brand profile completeness (max 15 pts)
  try {
    const clientRow = db.prepare(`
      SELECT brand_name, industry, tone, channels, context_md
      FROM client_contexts WHERE id = ?
    `).get(String(clientId));

    if (clientRow) {
      let filledFields = 0;
      if (clientRow.brand_name) filledFields++;
      if (clientRow.industry) filledFields++;
      if (clientRow.tone) filledFields++;
      if (clientRow.channels) filledFields++;
      if (clientRow.context_md) filledFields++;
      score += Math.round((filledFields / 5) * 15);
    }
  } catch {
    // can't access client_contexts
  }

  const finalScore = Math.max(0, Math.min(100, score));

  // Persist the computed score
  try {
    updateHealthScore(clientId, finalScore);
  } catch {
    // non-critical
  }

  return finalScore;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function serializeField(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function deserializeField(value) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function deserializeClient(row) {
  return {
    id: row.id,
    name: row.name,
    brandName: row.brandName,
    industry: row.industry,
    tone: row.tone,
    channels: deserializeField(row.channels),
    rateCard: deserializeField(row.rateCard),
    brandGradient: row.brandGradient,
    airtableRecordId: row.airtableRecordId,
    notionPageId: row.notionPageId,
    whatsappNumber: row.whatsappNumber,
    contextMd: row.contextMd,
    mindMapData: deserializeField(row.mindMapData) || {},
    healthScore: row.healthScore || 0,
    healthComputedAt: row.healthComputedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

module.exports = {
  getClientContext,
  setClientContext,
  getAllClients,
  updateHealthScore,
  computeHealthScore
};
