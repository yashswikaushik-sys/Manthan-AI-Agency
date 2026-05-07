require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const cron = require('node-cron');
const axios = require('axios');
const { getDb } = require('../memory/db');

let jobsStarted = false;
const runningJobs = new Set();

function log(jobName, msg) {
  console.log(`[scheduler][${jobName}] ${new Date().toISOString()} — ${msg}`);
}

async function callAgent(agentName, input, clientId = null) {
  try {
    const res = await axios.post(`http://localhost:${process.env.PORT || 3000}/api/agent/${agentName}`, {
      messages: [{ role: 'user', content: input }],
      clientId,
      sessionId: `scheduler_${agentName}_${Date.now()}`
    }, { timeout: 120000 });
    return res.data;
  } catch (e) {
    throw new Error(`Agent call failed: ${e.message}`);
  }
}

async function safeRun(jobName, fn) {
  if (runningJobs.has(jobName)) {
    log(jobName, 'already running, skipping');
    return;
  }
  runningJobs.add(jobName);
  const db = getDb();
  try {
    log(jobName, 'starting');
    await fn();
    log(jobName, 'completed successfully');
    db.prepare(`
      INSERT INTO notifications (type, title, message, created_at)
      VALUES ('scheduler', ?, ?, CURRENT_TIMESTAMP)
    `).run(`Job completed: ${jobName}`, `Scheduler job "${jobName}" ran successfully at ${new Date().toISOString()}`);
  } catch (err) {
    log(jobName, `ERROR: ${err.message}`);
    db.prepare(`
      INSERT INTO notifications (type, title, message, created_at)
      VALUES ('scheduler_error', ?, ?, CURRENT_TIMESTAMP)
    `).run(`Job failed: ${jobName}`, `Error: ${err.message}`);
  } finally {
    runningJobs.delete(jobName);
  }
}

// ── JOB 1: Daily Client Health Score (6:50am IST) ─────────────────────────────
// Runs before morning brief so brief has fresh scores
// IST = UTC+5:30, so 6:50 IST = 1:20 UTC
function scheduleHealthScores() {
  cron.schedule('20 1 * * *', async () => {
    await safeRun('client-health-scores', async () => {
      const db = getDb();
      const clients = db.prepare('SELECT id FROM client_contexts').all();
      const { computeHealthScore, updateHealthScore } = require('../memory/client-context');
      for (const client of clients) {
        const score = await computeHealthScore(client.id);
        updateHealthScore(client.id, score);
        log('client-health-scores', `Client ${client.id}: score=${score}`);
      }
    });
  }, { timezone: 'UTC' });
}

// ── JOB 2: Morning Brief (7:00am IST = 1:30 UTC) ──────────────────────────────
function scheduleMorningBrief() {
  cron.schedule('30 1 * * *', async () => {
    await safeRun('morning-brief', async () => {
      await callAgent('morning-brief', 'Generate and send the daily morning brief for Yash. Include calendar, active projects, pending approvals, pipeline health, and one focus recommendation.');
    });
  }, { timezone: 'UTC' });
}

// ── JOB 3: Approval Queue Notifier (every hour) ───────────────────────────────
// Checks for ANY pending approvals. Sends WhatsApp reminder if any exist.
// Silent if queue is clear.
function scheduleApprovalNotifier() {
  cron.schedule('0 * * * *', async () => {
    await safeRun('approval-notifier', async () => {
      const db = getDb();

      // Check SQLite approvals
      const localPending = db.prepare(`
        SELECT COUNT(*) as count FROM approvals WHERE status='pending'
      `).get();

      // Also check Airtable Approval Queue
      let airtablePending = 0;
      let pendingTitles = [];
      try {
        const airtable = require('../tools/airtable');
        const records = await airtable.read({
          table: 'Approval Queue',
          filterFormula: `{approval_status}="Pending Review"`,
          maxRecords: 20,
          fields: ['title', 'client_name', 'content_type']
        });
        airtablePending = records.length;
        pendingTitles = records.map(r => `• ${r.fields.client_name || 'Unknown'}: ${r.fields.title || 'Untitled'}`);
      } catch (e) {
        log('approval-notifier', `Airtable check failed: ${e.message}`);
      }

      const totalPending = (localPending?.count || 0) + airtablePending;

      if (totalPending > 0) {
        const whatsapp = require('../tools/whatsapp');
        const timeIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
        const listStr = pendingTitles.length > 0 ? '\n' + pendingTitles.slice(0, 5).join('\n') : '';
        await whatsapp.send({
          message: `⏳ APPROVAL REMINDER (${timeIST} IST)\n\n${totalPending} item(s) pending review:${listStr}\n\nReview at: http://localhost:${process.env.PORT || 3000}`
        });
      }
      // Silent if queue is clear — no notification sent
    });
  }, { timezone: 'UTC' });
}

// ── JOB 4: Automation Health Monitor (every 2 hours) ──────────────────────────
// Checks if n8n workflows are active and healthy.
// ONLY sends WhatsApp if something is broken. Silent when all good.
function scheduleAutomationHealthMonitor() {
  cron.schedule('0 */2 * * *', async () => {
    await safeRun('automation-health-monitor', async () => {
      const n8n = require('../tools/n8n');
      let issues = [];

      try {
        const workflows = await n8n.listWorkflows();
        const expectedActive = [
          { id: 'towKjut9ux0BwUnj', name: 'Morning Brief Generator' },
          { id: 'CV4YMAvaaDCuFig4', name: 'Weekly Agency Health Report' },
          { id: 'BKet8msklcbckTE6', name: 'Lead Outreach Sequencer' },
          { id: 'GezcMF6nkJRgxovB', name: 'Automation Health Monitor' },
          { id: 'p8JpjvqLWI4PdaT1', name: 'Approval Queue Notifier' },
          { id: 'yyylX0KIbIQhUmcB', name: 'Client Onboarding Flow' }
        ];

        for (const expected of expectedActive) {
          const found = workflows.find(w => w.id === expected.id);
          if (!found) {
            issues.push(`❌ Workflow not found: ${expected.name} (${expected.id})`);
          } else if (!found.active) {
            issues.push(`⚠️ Workflow INACTIVE: ${expected.name}`);
          }
        }
      } catch (e) {
        issues.push(`❌ n8n API unreachable: ${e.message}`);
      }

      // Also check agent_runs for recent errors
      try {
        const db = getDb();
        const recentErrors = db.prepare(`
          SELECT agent_name, COUNT(*) as error_count
          FROM agent_runs
          WHERE status='error' AND created_at > datetime('now', '-2 hours')
          GROUP BY agent_name
          HAVING error_count >= 2
        `).all();

        for (const row of recentErrors) {
          issues.push(`⚠️ Agent "${row.agent_name}" failed ${row.error_count} times in last 2h`);
        }
      } catch (e) {
        // DB check failed — non-critical
      }

      // ONLY alert if issues found. Silent when everything is healthy.
      if (issues.length > 0) {
        const whatsapp = require('../tools/whatsapp');
        await whatsapp.send({
          message: `🔴 AUTOMATION ISSUE DETECTED\n\n${issues.join('\n')}\n\nCheck the Connector Map for details.`
        });
      }
      // No message if all healthy — don't spam Yash
    });
  }, { timezone: 'UTC' });
}

// ── JOB 5: Lead Re-engagement Sweep (every 72 hours) ─────────────────────────
// Find Tier A leads not contacted in 3 days, trigger outreach
function scheduleLeadReengagement() {
  cron.schedule('0 4 */3 * *', async () => {
    await safeRun('lead-reengagement', async () => {
      await callAgent('lead-qualifier',
        'Find Tier A leads (ai_score >= 8) that have not been contacted in the last 72 hours. Qualify the top 10 and prepare them for outreach. Update their Airtable records.'
      );
    });
  }, { timezone: 'UTC' });
}

// ── JOB 6: Weekly Competitor Intelligence (Monday 9:00am IST = 3:30 UTC) ──────
function scheduleCompetitorWatch() {
  cron.schedule('30 3 * * 1', async () => {
    await safeRun('competitor-watch', async () => {
      const db = getDb();
      const clients = db.prepare(`SELECT id, name FROM client_contexts`).all();
      for (const client of clients) {
        await callAgent('competitor-watch',
          `Run weekly competitor intelligence for ${client.name}. Find what competitors have done in the last 7 days and identify opportunities.`,
          client.id
        );
      }
    });
  }, { timezone: 'UTC' });
}

// ── JOB 7: Weekly Deliverable Audit (Friday 5:00pm IST = 11:30 UTC) ───────────
// Check promised vs delivered this week
function scheduleDeliverableAudit() {
  cron.schedule('30 11 * * 5', async () => {
    await safeRun('deliverable-audit', async () => {
      const db = getDb();
      const overdue = db.prepare(`
        SELECT id, title, client_name, due_date, status
        FROM deliverables
        WHERE due_date < date('now') AND status NOT IN ('approved','published')
        ORDER BY due_date ASC
      `).all();

      if (overdue.length > 0) {
        const whatsapp = require('../tools/whatsapp');
        const list = overdue.slice(0, 10).map(d =>
          `• ${d.client_name}: "${d.title}" (due ${d.due_date}, status: ${d.status})`
        ).join('\n');
        await whatsapp.send({
          message: `📋 FRIDAY DELIVERY AUDIT\n\n${overdue.length} overdue deliverable(s):\n${list}\n\nReview in OS → Deliverables.`
        });
      }

      // Also notify about pending approvals >72h
      const stalePending = db.prepare(`
        SELECT title, client_name, created_at FROM approvals
        WHERE status='pending' AND created_at < datetime('now', '-72 hours')
      `).all();

      if (stalePending.length > 0) {
        const whatsapp = require('../tools/whatsapp');
        await whatsapp.send({
          message: `⚠️ ${stalePending.length} approval(s) pending for >72h — clients waiting!`
        });
      }
    });
  }, { timezone: 'UTC' });
}

// ── JOB 8: Monthly Invoice Generation (1st of month, 2:00am IST) ─────────────
function scheduleMonthlyInvoices() {
  cron.schedule('0 2 1 * *', async () => {
    await safeRun('monthly-invoices', async () => {
      await callAgent('finance-tracker',
        'Generate draft invoices for all active clients for the upcoming month. Create invoice records in the system and prepare the monthly financial snapshot.'
      );
    });
  }, { timezone: 'Asia/Kolkata' });
}

// ── JOB 8B: Monthly Financial Snapshot (1st, 2:30am IST) ─────────────────────
function scheduleMonthlyFinancialSnapshot() {
  cron.schedule('30 2 1 * *', async () => {
    await safeRun('financial-snapshot', async () => {
      const now = new Date();
      await callAgent('finance-tracker',
        `Generate the monthly financial snapshot for ${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}. Calculate MRR, outstanding invoices, collection rate, and save to Notion.`
      );
    });
  }, { timezone: 'Asia/Kolkata' });
}

// ── JOB 9: Weekly System Audit (Sunday 10:00am IST = 4:30 UTC) ───────────────
function scheduleSystemAudit() {
  cron.schedule('30 4 * * 0', async () => {
    await safeRun('system-audit', async () => {
      const db = getDb();
      const agentStats = db.prepare(`
        SELECT agent_name,
               COUNT(*) as total_runs,
               SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success_count,
               AVG(duration_ms) as avg_duration,
               MAX(created_at) as last_run
        FROM agent_runs
        WHERE created_at > datetime('now', '-7 days')
        GROUP BY agent_name
      `).all();

      const overdueDeliverables = db.prepare(`
        SELECT COUNT(*) as count FROM deliverables
        WHERE due_date < date('now') AND status NOT IN ('approved','published')
      `).get();

      const pendingApprovals72h = db.prepare(`
        SELECT COUNT(*) as count FROM approvals
        WHERE status='pending' AND created_at < datetime('now', '-72 hours')
      `).get();

      const auditContext = JSON.stringify({
        agentStats,
        overdueDeliverables: overdueDeliverables.count,
        pendingApprovals72h: pendingApprovals72h.count,
        weekOf: new Date().toISOString()
      });

      await callAgent('system-auditor',
        `Run the weekly system audit. Here is the performance data from the past 7 days:\n\n${auditContext}\n\nAnalyze this data, check integration health, identify automation opportunities, and send the audit report to WhatsApp and save to Notion.`
      );
    });
  }, { timezone: 'UTC' });
}

function startScheduler() {
  if (jobsStarted) return;
  jobsStarted = true;

  scheduleHealthScores();
  scheduleMorningBrief();
  scheduleApprovalNotifier();
  scheduleAutomationHealthMonitor();
  scheduleLeadReengagement();
  scheduleCompetitorWatch();
  scheduleDeliverableAudit();
  scheduleMonthlyInvoices();
  scheduleMonthlyFinancialSnapshot();
  scheduleSystemAudit();

  console.log('[scheduler] All jobs scheduled. Key behaviors:');
  console.log('  • Approval Queue: checked every hour — alerts if ANY pending');
  console.log('  • Automation Health: checked every 2h — alerts ONLY if broken');
  console.log('  • Morning Brief: 7:00am IST daily');
  console.log('  • System Audit: Sunday 10:00am IST');
}

module.exports = { startScheduler };
