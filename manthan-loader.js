#!/usr/bin/env node

/**
 * MANTHAN AI AGENCY — CLAUDE CODE ENVIRONMENT LOADER
 * Version: V5 | Reality-Adjusted Edition
 *
 * This file runs automatically when Claude Code starts.
 * It loads all environment variables, vaults, memory, and context.
 * Result: Every session starts with full agency context ready.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================================
// CONFIGURATION
// ============================================================================

const MANTHAN_ROOT = path.join(os.homedir(), '.manthan');
const CONFIG = {
  env_file: path.join(MANTHAN_ROOT, '.env'),
  master_prompt: path.join(MANTHAN_ROOT, 'master-prompt.md'),
  locked_decisions: path.join(MANTHAN_ROOT, 'memory/locked-decisions.md'),
  client_context: path.join(MANTHAN_ROOT, 'memory/client-context.md'),
  challenge_log: path.join(MANTHAN_ROOT, 'memory/challenge-log.json'),
  startup_log: path.join(MANTHAN_ROOT, 'output/startup-log.txt'),
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(level, message) {
  const timestamp = new Date().toISOString();
  const prefix = {
    'INFO': '✓',
    'WARN': '⚠️',
    'ERROR': '❌',
    'SUCCESS': '✅'
  }[level] || '•';

  console.log(`[${timestamp}] ${prefix} ${message}`);

  try {
    fs.appendFileSync(CONFIG.startup_log, `[${timestamp}] [${level}] ${message}\n`);
  } catch (e) {
    // Silent fail if log file not writable
  }
}

function fileExists(filepath) {
  try {
    return fs.existsSync(filepath);
  } catch (e) {
    return false;
  }
}

function readFile(filepath) {
  try {
    return fs.readFileSync(filepath, 'utf8');
  } catch (e) {
    log('WARN', `Could not read ${filepath}`);
    return '';
  }
}

function parseEnvFile(content) {
  const env = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').replace(/^["']|["']$/g, '');

    if (key) {
      env[key] = value;
      process.env[key] = value;
    }
  }

  return env;
}

// ============================================================================
// LOAD ENVIRONMENT
// ============================================================================

function loadEnvironment() {
  log('INFO', 'Loading environment variables...');

  if (fileExists(CONFIG.env_file)) {
    const envContent = readFile(CONFIG.env_file);
    const env = parseEnvFile(envContent);
    log('SUCCESS', `Environment loaded (${Object.keys(env).length} variables)`);
    return env;
  } else {
    log('WARN', 'Environment file not found. Using defaults.');
    return {};
  }
}

// ============================================================================
// LOAD MASTER PROMPT
// ============================================================================

function loadMasterPrompt() {
  log('INFO', 'Loading Master Prompt...');

  if (fileExists(CONFIG.master_prompt)) {
    const prompt = readFile(CONFIG.master_prompt);
    log('SUCCESS', 'Master Prompt ready (paste into every session)');
    return prompt;
  } else {
    log('WARN', 'Master Prompt not found');
    return '';
  }
}

// ============================================================================
// LOAD MEMORY STORES
// ============================================================================

function loadMemory() {
  log('INFO', 'Loading memory stores...');

  const memory = {};

  if (fileExists(CONFIG.locked_decisions)) {
    memory.lockedDecisions = readFile(CONFIG.locked_decisions);
    log('SUCCESS', 'Locked decisions loaded');
  }

  if (fileExists(CONFIG.client_context)) {
    memory.clientContext = readFile(CONFIG.client_context);
    log('SUCCESS', 'Client context loaded');
  }

  if (fileExists(CONFIG.challenge_log)) {
    try {
      memory.challengeLog = JSON.parse(readFile(CONFIG.challenge_log));
      log('SUCCESS', 'Challenge Log loaded');
    } catch (e) {
      log('WARN', 'Challenge Log corrupted, skipping');
    }
  }

  return memory;
}

// ============================================================================
// VERIFY VAULT & CONNECTORS
// ============================================================================

function verifyInfrastructure() {
  log('INFO', 'Verifying infrastructure...');

  const checks = {
    vault: fileExists(path.join(MANTHAN_ROOT, 'vaults/vault-structure.json')),
    memory: fileExists(path.join(MANTHAN_ROOT, 'memory')),
    projects: fileExists(path.join(MANTHAN_ROOT, 'projects')),
  };

  const passed = Object.values(checks).filter(Boolean).length;
  log('SUCCESS', `Infrastructure verified (${passed}/3 checks passed)`);

  if (!checks.vault) {
    log('WARN', 'Bitwarden vault not yet configured. Setup required.');
  }

  return checks;
}

// ============================================================================
// GENERATE SESSION CONTEXT
// ============================================================================

function generateSessionContext(env, memory, masterPrompt) {
  return {
    timestamp: new Date().toISOString(),
    environment: env,
    memory: memory,
    masterPrompt: masterPrompt,
    sessionChecklist: {
      environmentLoaded: Object.keys(env).length > 0,
      masterPromptReady: masterPrompt.length > 0,
      lockedDecisionsReady: !!memory.lockedDecisions,
      clientContextReady: !!memory.clientContext,
      challengeLogReady: !!memory.challengeLog,
    },
  };
}

// ============================================================================
// DISPLAY STARTUP BANNER
// ============================================================================

function displayBanner(context) {
  console.clear();

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                ║');
  console.log('║         🚀 MANTHAN AI AGENCY — CLAUDE CODE SESSION 🚀          ║');
  console.log('║                   Co-Founder Mode Active                       ║');
  console.log('║                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('📋 SESSION INITIALIZATION:');
  console.log(`   Founder: ${context.environment.FOUNDER_NAME || 'Yash'}`);
  console.log(`   Agency: ${context.environment.AGENCY_NAME || 'Manthan'}`);
  console.log(`   Status: ${context.environment.AGENCY_STATUS || 'Operational'}`);
  console.log(`   Location: ${context.environment.LOCATION || 'Bengaluru'}`);
  console.log('');

  console.log('📊 ACTIVE CLIENTS:');
  const clients = [
    context.environment.CLIENT_1,
    context.environment.CLIENT_2,
    context.environment.CLIENT_3,
    context.environment.CLIENT_4,
  ].filter(Boolean);
  clients.forEach(c => console.log(`   • ${c}`));
  console.log(`   Pipeline: ${context.environment.PIPELINE_PROSPECT}`);
  console.log('');

  console.log('🔌 CONNECTED SYSTEMS:');
  const connectors = context.environment.CONNECTORS_ACTIVE?.split(',') || [];
  connectors.forEach(c => console.log(`   ✓ ${c.trim()}`));
  console.log('');

  console.log('📚 MEMORY STATUS:');
  console.log(`   ${context.sessionChecklist.lockedDecisionsReady ? '✓' : '✗'} Locked Decisions`);
  console.log(`   ${context.sessionChecklist.clientContextReady ? '✓' : '✗'} Client Context`);
  console.log(`   ${context.sessionChecklist.challengeLogReady ? '✓' : '✗'} Challenge Log`);
  console.log('');

  console.log('⚙️  OPERATING MODE:');
  console.log(`   Workday: ${context.environment.WORKDAY_START} — ${context.environment.WORKDAY_END}`);
  console.log(`   Daily Hours: ${context.environment.WORKDAY_HOURS}hr`);
  console.log(`   Cowork Limit: ${context.environment.COWORK_MAX_PER_DAY}/day`);
  console.log(`   SP-14 Daily: ${context.environment.SP14_DAILY_REQUIRED ? 'REQUIRED' : 'optional'}`);
  console.log(`   SP-32 Gate: ${context.environment.SP32_DECISION_GATE ? 'ACTIVE' : 'inactive'}`);
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('🎯 READY TO START');
  console.log('');
  console.log('SESSION PROTOCOL:');
  console.log("  1️⃣  Copy Master Prompt → Paste into Claude");
  console.log("  2️⃣  Ask: \"What is today's SESSION TYPE?\"");
  console.log('  3️⃣  Ask: "What is the ONE outcome you need?"');
  console.log('  4️⃣  Proceed with co-founder decision making');
  console.log('');
  console.log('📖 QUICK ACCESS:');
  console.log('   Master Prompt: cat ~/.manthan/master-prompt.md');
  console.log('   Locked Decisions: cat ~/.manthan/memory/locked-decisions.md');
  console.log('   Client Context: cat ~/.manthan/memory/client-context.md');
  console.log('   Challenge Log: cat ~/.manthan/memory/challenge-log.json');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

// ============================================================================
// MAIN INITIALIZATION
// ============================================================================

async function initialize() {
  try {
    log('INFO', '════════════════════════════════════════════════════════');
    log('INFO', 'MANTHAN ENVIRONMENT INITIALIZATION STARTING');
    log('INFO', '════════════════════════════════════════════════════════');

    const env = loadEnvironment();
    const masterPrompt = loadMasterPrompt();
    const memory = loadMemory();
    const infrastructure = verifyInfrastructure();

    const context = generateSessionContext(env, memory, masterPrompt);
    global.MANTHAN = { context };

    displayBanner(context);

    log('SUCCESS', '════════════════════════════════════════════════════════');
    log('SUCCESS', 'ENVIRONMENT FULLY INITIALIZED');
    log('SUCCESS', '════════════════════════════════════════════════════════');

    return context;

  } catch (error) {
    log('ERROR', `Initialization failed: ${error.message}`);
    throw error;
  }
}

if (require.main === module) {
  initialize().catch(err => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
  });
}

module.exports = { initialize };
