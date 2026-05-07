'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '../../workspace');

/**
 * Ensure workspace directory exists.
 */
function ensureWorkspace() {
  if (!fs.existsSync(WORKSPACE_DIR)) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  }
}

/**
 * Sanitize a filename to remove illegal characters.
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-{2,}/g, '-')
    .slice(0, 200);
}

/**
 * Save content to a file in the workspace directory.
 * Appends a timestamp to avoid filename collisions.
 * @param {Object} params
 * @param {string} params.filename - Base filename (without extension)
 * @param {string} params.content - Content to write
 * @param {string} [params.format='txt'] - File extension (txt, md, json, csv, html, etc.)
 * @returns {Promise<{path: string, filename: string, size: number}>}
 */
async function save({ filename, content, format = 'txt' }) {
  if (!filename || typeof filename !== 'string' || filename.trim() === '') {
    throw new Error('[file-generator] filename is required');
  }
  if (content === null || content === undefined) {
    throw new Error('[file-generator] content is required');
  }

  ensureWorkspace();

  const sanitized = sanitizeFilename(filename.trim());
  const ext = String(format).toLowerCase().replace(/^\./, '');
  const timestamp = new Date().toISOString()
    .replace(/[:T]/g, '-')
    .replace(/\..+/, '');

  const finalFilename = `${sanitized}_${timestamp}.${ext}`;
  const filePath = path.join(WORKSPACE_DIR, finalFilename);

  const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  try {
    fs.writeFileSync(filePath, contentStr, 'utf8');

    const stats = fs.statSync(filePath);

    return {
      path: filePath,
      filename: finalFilename,
      size: stats.size,
      format: ext,
      workspace: WORKSPACE_DIR
    };
  } catch (error) {
    throw new Error(`[file-generator] Failed to write file "${finalFilename}": ${error.message}`);
  }
}

module.exports = { save };
