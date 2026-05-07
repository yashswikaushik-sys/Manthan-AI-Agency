'use strict';

const { getDb } = require('./db');

/**
 * Upsert a memory entry for an agent.
 * @param {Object} params
 * @param {string} params.agentName
 * @param {string|null} params.clientId
 * @param {string} params.key
 * @param {*} params.value - Any JSON-serializable value
 * @param {string} [params.memoryType='fact'] - 'fact' | 'preference' | 'run_stats' | 'learning' | 'context'
 * @param {number} [params.confidence=1.0] - 0.0 to 1.0
 */
function setMemory({ agentName, clientId = null, key, value, memoryType = 'fact', confidence = 1.0 }) {
  if (!agentName) throw new Error('[agent-memory] agentName is required');
  if (!key) throw new Error('[agent-memory] key is required');
  if (value === undefined) throw new Error('[agent-memory] value is required');

  const db = getDb();
  const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
  const safeConfidence = Math.min(1.0, Math.max(0.0, parseFloat(confidence) || 1.0));

  db.prepare(`
    INSERT INTO agent_memory (agent_name, client_id, memory_type, key, value, confidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(agent_name, client_id, key) DO UPDATE SET
      value = excluded.value,
      memory_type = excluded.memory_type,
      confidence = excluded.confidence,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    String(agentName),
    clientId ? String(clientId) : null,
    String(memoryType),
    String(key),
    serializedValue,
    safeConfidence
  );
}

/**
 * Get a single memory value for an agent.
 * @param {Object} params
 * @param {string} params.agentName
 * @param {string|null} params.clientId
 * @param {string} params.key
 * @returns {*} The stored value (parsed from JSON if possible), or null if not found
 */
function getMemory({ agentName, clientId = null, key }) {
  if (!agentName) throw new Error('[agent-memory] agentName is required');
  if (!key) throw new Error('[agent-memory] key is required');

  const db = getDb();
  const row = db.prepare(`
    SELECT value FROM agent_memory
    WHERE agent_name = ? AND client_id IS ? AND key = ?
  `).get(String(agentName), clientId ? String(clientId) : null, String(key));

  if (!row) return null;

  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

/**
 * Get all memory entries for an agent (optionally scoped to a client).
 * @param {Object} params
 * @param {string} params.agentName
 * @param {string|null} [params.clientId]
 * @returns {Array<{key, value, memoryType, confidence, updatedAt}>}
 */
function getAllMemory({ agentName, clientId = null }) {
  if (!agentName) throw new Error('[agent-memory] agentName is required');

  const db = getDb();
  const rows = db.prepare(`
    SELECT key, value, memory_type as memoryType, confidence, updated_at as updatedAt
    FROM agent_memory
    WHERE agent_name = ? AND client_id IS ?
    ORDER BY updated_at DESC
  `).all(String(agentName), clientId ? String(clientId) : null);

  return rows.map(r => {
    let parsedValue = r.value;
    try {
      parsedValue = JSON.parse(r.value);
    } catch {
      // leave as string
    }
    return {
      key: r.key,
      value: parsedValue,
      memoryType: r.memoryType,
      confidence: r.confidence,
      updatedAt: r.updatedAt
    };
  });
}

/**
 * Delete a specific memory entry.
 * @param {Object} params
 * @param {string} params.agentName
 * @param {string|null} params.clientId
 * @param {string} params.key
 */
function deleteMemory({ agentName, clientId = null, key }) {
  if (!agentName) throw new Error('[agent-memory] agentName is required');
  if (!key) throw new Error('[agent-memory] key is required');

  const db = getDb();
  db.prepare(`
    DELETE FROM agent_memory
    WHERE agent_name = ? AND client_id IS ? AND key = ?
  `).run(String(agentName), clientId ? String(clientId) : null, String(key));
}

/**
 * Get aggregate run statistics for an agent from the agent_runs table.
 * @param {string} agentName
 * @returns {{ totalRuns: number, successRate: number, avgDuration: number, lastRun: string|null }}
 */
function getAgentStats(agentName) {
  if (!agentName) throw new Error('[agent-memory] agentName is required');

  const db = getDb();

  const stats = db.prepare(`
    SELECT
      COUNT(*) as totalRuns,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
      AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms ELSE NULL END) as avgDuration,
      MAX(created_at) as lastRun
    FROM agent_runs
    WHERE agent_name = ?
  `).get(String(agentName));

  if (!stats || stats.totalRuns === 0) {
    return {
      totalRuns: 0,
      successRate: 0,
      avgDuration: 0,
      lastRun: null
    };
  }

  const successRate = stats.totalRuns > 0
    ? Math.round((stats.successCount / stats.totalRuns) * 100) / 100
    : 0;

  return {
    totalRuns: stats.totalRuns,
    successRate,
    avgDuration: Math.round(stats.avgDuration || 0),
    lastRun: stats.lastRun || null
  };
}

module.exports = {
  setMemory,
  getMemory,
  getAllMemory,
  deleteMemory,
  getAgentStats
};
