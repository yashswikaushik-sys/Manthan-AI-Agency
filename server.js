require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./backend/memory/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// ── Lazy-load modules (avoid crash if env vars missing at startup) ─────────────
function getRunner() { return require('./backend/agents/runner'); }
function getAgents() { return require('./backend/config/agents'); }
function getAirtable() { return require('./backend/tools/airtable'); }
function getN8n() { return require('./backend/tools/n8n'); }
function getWhatsapp() { return require('./backend/tools/whatsapp'); }
function getWhatsappWebhook() { return require('./backend/tools/whatsapp-webhook'); }
function getConvStore() { return require('./backend/memory/conversation-store'); }
function getClientCtx() { return require('./backend/memory/client-context'); }
function getPdfGen() { return require('./backend/tools/pdf-generator'); }

// Utility: generate simple ID
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Utility: create notification
function notify(type, title, message, clientId = null) {
  try {
    const db = getDb();
    db.prepare(`INSERT INTO notifications (type,title,message,client_id) VALUES (?,?,?,?)`
    ).run(type, title, message, clientId);
  } catch(e) {}
}

// ──────────────────────────────────────────────────────────────────────────────
// CHAT & AGENTS
// ──────────────────────────────────────────────────────────────────────────────

// POST /api/chat/stream — SSE streaming chat
app.post('/api/chat/stream', async (req, res) => {
  const { messages, agentName = 'orchestrator', clientId, sessionId = newId(), devilsAdvocate = false } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const agentConfigs = getAgents();
    let agentModule = agentConfigs.find(a => a.name === agentName);

    if (!agentModule) {
      // Try loading from agents/ directory directly
      try {
        agentModule = require(`./backend/agents/${agentName}`);
      } catch(e) {
        agentModule = require('./backend/agents/orchestrator');
      }
    } else {
      agentModule = require(`./backend/agents/${agentModule.name}`);
    }

    // Devil's advocate mode — append instruction to system prompt
    if (devilsAdvocate && agentModule.systemPrompt) {
      agentModule = {
        ...agentModule,
        systemPrompt: agentModule.systemPrompt + `\n\nDEVIL'S ADVOCATE MODE: After your main response, add a section "🔴 Devil's Advocate:" where you strongly challenge your own recommendations and surface the biggest risks and counterarguments.`
      };
    }

    // Add client context to messages if clientId provided
    let enrichedMessages = [...messages];
    if (clientId) {
      const ctx = getClientCtx().getClientContext(clientId);
      if (ctx?.context_md) {
        enrichedMessages = [
          { role: 'user', content: `[Client Context]\n${ctx.context_md}` },
          { role: 'assistant', content: 'Understood. I have the client context loaded.' },
          ...messages
        ];
      }
    }

    // Save user message to conversation store
    const convStore = getConvStore();
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg?.role === 'user') {
      convStore.saveMessage({ sessionId, role: 'user', content: lastUserMsg.content, agentName, clientId });
    }

    const { runAgent } = getRunner();
    let fullResponse = '';

    const result = await runAgent(agentModule, enrichedMessages, {
      clientId,
      sessionId,
      stream: true,
      onChunk: (chunk) => {
        fullResponse += chunk;
        send({ type: 'chunk', content: chunk });
      },
      onToolUse: (tool) => {
        send({ type: 'tool_use', name: tool.name, input: tool.input });
      }
    });

    // Save assistant response
    convStore.saveMessage({
      sessionId,
      role: 'assistant',
      content: result.output || fullResponse,
      agentName,
      clientId,
      tokensUsed: result.tokensTotal
    });

    send({ type: 'done', tokensTotal: result.tokensTotal, sessionId });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    send({ type: 'error', message: err.message });
    res.end();
  }
});

// POST /api/chat — non-streaming
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, agentName = 'orchestrator', clientId, sessionId = newId(), devilsAdvocate = false } = req.body;
    let agentModule;
    try {
      agentModule = require(`./backend/agents/${agentName}`);
    } catch(e) {
      agentModule = require('./backend/agents/orchestrator');
    }

    if (devilsAdvocate && agentModule.systemPrompt) {
      agentModule = { ...agentModule, systemPrompt: agentModule.systemPrompt + `\n\nDEVIL'S ADVOCATE MODE: After your response, add "🔴 Devil's Advocate:" and strongly challenge your own recommendations.` };
    }

    const { runAgent } = getRunner();
    const result = await runAgent(agentModule, messages, { clientId, sessionId });
    res.json({ output: result.output, tokensTotal: result.tokensTotal, sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agent/:name — run any agent by name
app.post('/api/agent/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { messages, clientId, sessionId = newId() } = req.body;
    const agentModule = require(`./backend/agents/${name}`);
    const { runAgent } = getRunner();
    const result = await runAgent(agentModule, messages, { clientId, sessionId });
    res.json({ output: result.output, tokensTotal: result.tokensTotal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workbench/:tool — 9 workbench tools
app.post('/api/workbench/:tool', async (req, res) => {
  try {
    const { tool } = req.params;
    const input = req.body;
    const toolMap = {
      'web-search': () => require('./backend/tools/web-search').search(input),
      'url-scraper': () => require('./backend/tools/url-scraper').scrape(input),
      'hook-writer': () => {
        const agent = require('./backend/agents/hook-writer');
        const { runAgent } = getRunner();
        return runAgent(agent, [{ role: 'user', content: input.prompt || JSON.stringify(input) }]);
      },
      'caption-writer': () => {
        const agent = require('./backend/agents/caption-writer');
        const { runAgent } = getRunner();
        return runAgent(agent, [{ role: 'user', content: input.prompt || JSON.stringify(input) }]);
      },
      'email-writer': () => {
        const agent = require('./backend/agents/email-writer');
        const { runAgent } = getRunner();
        return runAgent(agent, [{ role: 'user', content: input.prompt || JSON.stringify(input) }]);
      },
      'brand-research': () => {
        const agent = require('./backend/agents/brand-intelligence');
        const { runAgent } = getRunner();
        return runAgent(agent, [{ role: 'user', content: input.prompt || JSON.stringify(input) }]);
      },
      'lead-qualifier': () => {
        const agent = require('./backend/agents/lead-qualifier');
        const { runAgent } = getRunner();
        return runAgent(agent, [{ role: 'user', content: input.prompt || JSON.stringify(input) }]);
      },
      'repurposing': () => {
        const agent = require('./backend/agents/repurposing');
        const { runAgent } = getRunner();
        return runAgent(agent, [{ role: 'user', content: input.prompt || JSON.stringify(input) }]);
      },
      'sop-generator': () => {
        const agent = require('./backend/agents/sop-generator');
        const { runAgent } = getRunner();
        return runAgent(agent, [{ role: 'user', content: input.prompt || JSON.stringify(input) }]);
      }
    };
    const fn = toolMap[tool];
    if (!fn) return res.status(404).json({ error: `Unknown tool: ${tool}` });
    const result = await fn();
    res.json({ result: typeof result === 'object' ? result : { output: result } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// CLIENTS
// ──────────────────────────────────────────────────────────────────────────────

app.get('/api/clients', async (req, res) => {
  try {
    const clients = getClientCtx().getAllClients();
    res.json({ clients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const clientData = { id: newId(), ...req.body, created_at: new Date().toISOString() };
    getClientCtx().setClientContext(clientData);
    // Trigger onboarding agent async
    const agent = require('./backend/agents/client-onboarding');
    const { runAgent } = getRunner();
    runAgent(agent, [{
      role: 'user',
      content: `Onboard new client: ${JSON.stringify(clientData)}`
    }], { clientId: clientData.id }).catch(e => console.error('[onboarding]', e.message));
    notify('client', `New client onboarded: ${clientData.name}`, `Client ${clientData.name} added to Manthan OS`);
    res.json({ client: clientData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const client = getClientCtx().getClientContext(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const existing = getClientCtx().getClientContext(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });
    getClientCtx().setClientContext({ ...existing, ...req.body, id: req.params.id });
    res.json({ client: getClientCtx().getClientContext(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:id/deliverables', async (req, res) => {
  try {
    const db = getDb();
    const deliverables = db.prepare(
      `SELECT * FROM deliverables WHERE client_id=? ORDER BY due_date ASC`
    ).all(req.params.id);
    res.json({ deliverables });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// LEADS
// ──────────────────────────────────────────────────────────────────────────────

app.get('/api/leads', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const filterFormula = status ? `{status}="${status}"` : undefined;
    const records = await getAirtable().read({
      table: 'Leads',
      filterFormula,
      maxRecords: parseInt(limit),
      fields: ['business_name', 'phone', 'category', 'address', 'ai_score', 'status', 'email', 'last_contact', 'pain_point', 'pitch_angle']
    });
    res.json({ leads: records, count: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leads/stats', async (req, res) => {
  try {
    const all = await getAirtable().read({ table: 'Leads', maxRecords: 100 });
    const stats = {
      total: all.length,
      tierA: all.filter(r => (r.fields.ai_score || 0) >= 8).length,
      tierB: all.filter(r => (r.fields.ai_score || 0) >= 6 && (r.fields.ai_score || 0) < 8).length,
      contacted: all.filter(r => r.fields.status === 'Contacted').length,
      converted: all.filter(r => r.fields.status === 'Converted').length,
      pipeline: all.filter(r => r.fields.status === 'In Pipeline').length
    };
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leads/qualify-batch', async (req, res) => {
  try {
    const { count = 10 } = req.body;
    const agent = require('./backend/agents/lead-qualifier');
    const { runAgent } = getRunner();
    const result = await runAgent(agent, [{
      role: 'user',
      content: `Qualify the next ${count} unqualified leads (ai_score is empty or 0, status is not Contacted/Converted). Research each one, score them, and update Airtable.`
    }], { sessionId: `qualify_batch_${Date.now()}` });
    res.json({ output: result.output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// APPROVALS
// ──────────────────────────────────────────────────────────────────────────────

app.get('/api/approvals', async (req, res) => {
  try {
    const db = getDb();
    const localApprovals = db.prepare(
      `SELECT * FROM approvals ORDER BY created_at DESC LIMIT 50`
    ).all();

    // Also fetch from Airtable
    let airtableApprovals = [];
    try {
      const records = await getAirtable().read({
        table: 'Approval Queue',
        maxRecords: 30,
        fields: ['title', 'client_name', 'content_type', 'platform', 'approval_status', 'priority', 'content_preview', 'whatsapp_sent']
      });
      airtableApprovals = records.map(r => ({
        id: `at_${r.id}`,
        source: 'airtable',
        airtable_record_id: r.id,
        ...r.fields,
        status: r.fields.approval_status || 'pending'
      }));
    } catch(e) {}

    res.json({ approvals: [...localApprovals, ...airtableApprovals] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/approvals/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, feedback, reviewedBy = 'Yash', reviewedVia = 'dashboard' } = req.body;
    const db = getDb();

    if (id.startsWith('at_')) {
      // Update Airtable
      const airtableId = id.replace('at_', '');
      await getAirtable().update({
        table: 'Approval Queue',
        recordId: airtableId,
        fields: {
          approval_status: status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Revision Requested',
          client_feedback: feedback,
          reviewed_date: new Date().toISOString()
        }
      });
    } else {
      // Update local DB
      db.prepare(`
        UPDATE approvals SET status=?, client_feedback=?, reviewed_by=?, reviewed_via=?, reviewed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(status, feedback, reviewedBy, reviewedVia, id);
    }

    // Log to audit trail
    db.prepare(`
      INSERT INTO notifications (type, title, message, created_at)
      VALUES ('approval_audit', ?, ?, CURRENT_TIMESTAMP)
    `).run(
      `Approval ${status}: ${id}`,
      `Reviewed by ${reviewedBy} via ${reviewedVia}. Feedback: ${feedback || 'none'}`
    );

    res.json({ success: true, id, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// n8n BRIDGE
// ──────────────────────────────────────────────────────────────────────────────

app.get('/api/n8n/workflows', async (req, res) => {
  try {
    const workflows = await getN8n().listWorkflows();
    res.json({ workflows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/n8n/executions', async (req, res) => {
  try {
    const { workflowId, limit = 10 } = req.query;
    const executions = await getN8n().getExecutions({ workflowId, limit: parseInt(limit) });
    res.json({ executions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/n8n/workflow/:id/trigger', async (req, res) => {
  try {
    const result = await getN8n().triggerWorkflow({ workflowId: req.params.id, data: req.body });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/n8n/health', async (req, res) => {
  try {
    const health = await getN8n().getHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message, status: 'unreachable' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// FINANCIALS & INVOICES
// ──────────────────────────────────────────────────────────────────────────────

app.get('/api/financials', async (req, res) => {
  try {
    const db = getDb();
    const snapshots = db.prepare(`SELECT * FROM financials ORDER BY year DESC, month DESC LIMIT 12`).all();
    const clients = getClientCtx().getAllClients();
    const mrr = clients.reduce((sum, c) => {
      const rate = JSON.parse(c.rate_card || '{}')?.monthly_retainer || 0;
      return sum + rate;
    }, 0);
    res.json({ snapshots, currentMrr: mrr, clientCount: clients.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/financials/mrr', async (req, res) => {
  try {
    const clients = getClientCtx().getAllClients();
    const mrrBreakdown = clients.map(c => ({
      clientId: c.id,
      clientName: c.name,
      retainer: JSON.parse(c.rate_card || '{}')?.monthly_retainer || 0
    }));
    const totalMrr = mrrBreakdown.reduce((s, c) => s + c.retainer, 0);
    res.json({ totalMrr, breakdown: mrrBreakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/invoices', async (req, res) => {
  try {
    const db = getDb();
    const invoices = db.prepare(`SELECT * FROM invoices ORDER BY created_at DESC`).all();
    res.json({ invoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices', async (req, res) => {
  try {
    const db = getDb();
    const invoice = {
      id: newId(),
      invoice_number: `INV-${new Date().getFullYear()}-${String(db.prepare('SELECT COUNT(*) as c FROM invoices').get().c + 1).padStart(3, '0')}`,
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.prepare(`
      INSERT INTO invoices (id, invoice_number, client_id, client_name, amount, currency, status, due_date, line_items, notes, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(invoice.id, invoice.invoice_number, invoice.client_id, invoice.client_name, invoice.amount, invoice.currency || 'INR', invoice.status || 'draft', invoice.due_date, JSON.stringify(invoice.line_items || []), invoice.notes, invoice.created_at, invoice.updated_at);
    notify('invoice', `Invoice created: ${invoice.invoice_number}`, `${invoice.client_name} — ₹${invoice.amount}`);
    res.json({ invoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/invoices/:id/pdf', async (req, res) => {
  try {
    const db = getDb();
    const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const { generateInvoice } = getPdfGen();
    const result = await generateInvoice({
      invoice,
      clientName: invoice.client_name,
      lineItems: JSON.parse(invoice.line_items || '[]')
    });
    res.download(result.path, result.filename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// SYSTEM
// ──────────────────────────────────────────────────────────────────────────────

app.get('/api/system/health', (req, res) => {
  const db = getDb();
  const agentRuns = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success FROM agent_runs WHERE created_at > datetime('now', '-24 hours')`).get();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    agentRuns24h: agentRuns.total,
    agentSuccessRate: agentRuns.total > 0 ? Math.round((agentRuns.success / agentRuns.total) * 100) : 100,
    memory: process.memoryUsage()
  });
});

app.get('/api/system/connectors', async (req, res) => {
  const connectors = [
    { id: 'anthropic', name: 'Anthropic Claude', type: 'ai', status: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing' },
    { id: 'airtable', name: 'Airtable', type: 'database', status: process.env.AIRTABLE_API_KEY ? 'configured' : 'missing' },
    { id: 'n8n', name: 'n8n Workflows', type: 'automation', status: process.env.N8N_API_KEY ? 'configured' : 'missing' },
    { id: 'notion', name: 'Notion', type: 'knowledge', status: process.env.NOTION_API_KEY ? 'configured' : 'missing' },
    { id: 'whatsapp', name: 'WhatsApp', type: 'messaging', status: process.env.WHATSAPP_ACCESS_TOKEN ? 'configured' : 'missing' },
    { id: 'brave', name: 'Brave Search', type: 'search', status: process.env.BRAVE_SEARCH_API_KEY ? 'configured' : 'missing' },
    { id: 'firecrawl', name: 'Firecrawl', type: 'scraping', status: process.env.FIRECRAWL_API_KEY ? 'configured' : 'missing' },
    { id: 'gmail', name: 'Gmail', type: 'email', status: process.env.GMAIL_CLIENT_ID ? 'configured' : 'missing' },
    { id: 'calendar', name: 'Google Calendar', type: 'calendar', status: process.env.GOOGLE_CALENDAR_ID ? 'configured' : 'missing' }
  ];

  // Check n8n live
  try {
    const health = await getN8n().getHealth();
    const n8nConn = connectors.find(c => c.id === 'n8n');
    if (n8nConn) { n8nConn.status = 'live'; n8nConn.detail = health; }
  } catch(e) {
    const n8nConn = connectors.find(c => c.id === 'n8n');
    if (n8nConn && n8nConn.status === 'configured') n8nConn.status = 'error';
  }

  res.json({ connectors });
});

app.get('/api/webhook/events', (req, res) => {
  const db = getDb();
  const events = db.prepare(`SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 50`).all();
  res.json({ events });
});

// WhatsApp webhook verification (GET)
app.get('/api/whatsapp/webhook', (req, res) => {
  const { verifyWebhook } = getWhatsappWebhook();
  verifyWebhook(req, res);
});

// WhatsApp inbound messages (POST)
app.post('/api/whatsapp/webhook', async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately
  try {
    const { processInbound } = getWhatsappWebhook();
    const parsed = await processInbound(req.body);
    if (parsed?.text) {
      notify('whatsapp_inbound', 'WhatsApp message received', parsed.text);
    }
  } catch(e) {
    console.error('[whatsapp-webhook]', e.message);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// MEMORY & CONVERSATIONS
// ──────────────────────────────────────────────────────────────────────────────

app.get('/api/memory/clients/:id', (req, res) => {
  try {
    const client = getClientCtx().getClientContext(req.params.id);
    res.json({ client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/memory/clients/:id', (req, res) => {
  try {
    const existing = getClientCtx().getClientContext(req.params.id) || {};
    getClientCtx().setClientContext({ ...existing, ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/conversation/:sessionId', (req, res) => {
  try {
    const messages = getConvStore().getMessages(req.params.sessionId);
    res.json({ messages, sessionId: req.params.sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/conversation/:sessionId', (req, res) => {
  try {
    getConvStore().deleteSession(req.params.sessionId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────────────

app.get('/api/notifications', (req, res) => {
  const db = getDb();
  const notifications = db.prepare(
    `SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`
  ).all();
  const unread = db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE read=0`).get().c;
  res.json({ notifications, unread });
});

app.post('/api/notifications/mark-read', (req, res) => {
  const db = getDb();
  const { ids } = req.body;
  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE notifications SET read=1, read_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders})`).run(...ids);
  } else {
    db.prepare(`UPDATE notifications SET read=1, read_at=CURRENT_TIMESTAMP WHERE read=0`).run();
  }
  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────────────────────
// DELIVERABLES
// ──────────────────────────────────────────────────────────────────────────────

app.get('/api/deliverables', (req, res) => {
  const db = getDb();
  const { clientId, status } = req.query;
  let query = `SELECT * FROM deliverables`;
  const params = [];
  const conditions = [];
  if (clientId) { conditions.push(`client_id=?`); params.push(clientId); }
  if (status) { conditions.push(`status=?`); params.push(status); }
  if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
  query += ` ORDER BY due_date ASC`;
  res.json({ deliverables: db.prepare(query).all(...params) });
});

app.post('/api/deliverables', (req, res) => {
  try {
    const db = getDb();
    const d = { id: newId(), ...req.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    db.prepare(`
      INSERT INTO deliverables (id,client_id,client_name,title,type,platform,status,content,hashtags,image_prompt,brief,due_date,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(d.id, d.client_id, d.client_name, d.title, d.type, d.platform, d.status || 'brief', d.content, d.hashtags, d.image_prompt, d.brief, d.due_date, d.created_at, d.updated_at);
    res.json({ deliverable: d });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/deliverables/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM deliverables WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    // Save version if content changed
    if (req.body.content && req.body.content !== existing.content) {
      const nextVersion = (existing.current_version || 1) + 1;
      db.prepare(`
        INSERT OR IGNORE INTO content_versions (deliverable_id, version, content, changed_by, change_summary)
        VALUES (?,?,?,?,?)
      `).run(req.params.id, existing.current_version, existing.content, 'user', 'Previous version');
      req.body.current_version = nextVersion;
    }

    const updates = Object.entries({ ...req.body, updated_at: new Date().toISOString() })
      .map(([k]) => `${k}=?`).join(',');
    const values = [...Object.values({ ...req.body, updated_at: new Date().toISOString() }), req.params.id];
    db.prepare(`UPDATE deliverables SET ${updates} WHERE id=?`).run(...values);
    res.json({ deliverable: db.prepare('SELECT * FROM deliverables WHERE id=?').get(req.params.id) });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/deliverables/:id/versions', (req, res) => {
  const db = getDb();
  const versions = db.prepare(
    `SELECT * FROM content_versions WHERE deliverable_id=? ORDER BY version DESC`
  ).all(req.params.id);
  res.json({ versions });
});

// ──────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE BASE
// ──────────────────────────────────────────────────────────────────────────────

app.get('/api/knowledge-base', (req, res) => {
  const db = getDb();
  const entries = db.prepare(`SELECT * FROM saved_outputs WHERE output_type='knowledge' ORDER BY created_at DESC LIMIT 50`).all();
  res.json({ entries });
});

app.post('/api/knowledge-base', (req, res) => {
  try {
    const db = getDb();
    const entry = {
      id: newId(),
      session_id: req.body.sessionId,
      title: req.body.title,
      content: req.body.content,
      agent_name: 'knowledge-capture',
      client_id: req.body.clientId,
      output_type: 'knowledge',
      created_at: new Date().toISOString()
    };
    db.prepare(`INSERT INTO saved_outputs (session_id,title,content,agent_name,client_id,output_type) VALUES (?,?,?,?,?,?)`
    ).run(entry.session_id, entry.title, entry.content, entry.agent_name, entry.client_id, entry.output_type);
    res.json({ entry });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ──────────────────────────────────────────────────────────────────────────────
// CONTENT CALENDAR (Airtable proxy)
// ──────────────────────────────────────────────────────────────────────────────

app.get('/api/content-calendar', async (req, res) => {
  try {
    const records = await getAirtable().read({
      table: 'Content Calendar',
      maxRecords: 50,
      fields: ['post_title', 'client_name', 'platform', 'content_type', 'scheduled_date', 'calendar_status', 'caption', 'hashtags', 'image_prompt', 'approval_status']
    });
    res.json({ items: records });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ──────────────────────────────────────────────────────────────────────────────
// SAVED OUTPUTS (chat export, save to Notion)
// ──────────────────────────────────────────────────────────────────────────────

app.post('/api/outputs/save', async (req, res) => {
  try {
    const db = getDb();
    const { content, title, sessionId, clientId, agentName, saveToNotion = false } = req.body;
    db.prepare(`INSERT INTO saved_outputs (session_id,title,content,agent_name,client_id,output_type) VALUES (?,?,?,?,?,'output')`
    ).run(sessionId, title, content, agentName, clientId);

    let notionPageId = null;
    if (saveToNotion) {
      try {
        const notion = require('./backend/tools/notion');
        const page = await notion.createPage({ title: title || 'Agent Output', content });
        notionPageId = page.id;
      } catch(e) {}
    }
    res.json({ success: true, notionPageId });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ──────────────────────────────────────────────────────────────────────────────
// FRONTEND FALLBACK (SPA)
// ──────────────────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ──────────────────────────────────────────────────────────────────────────────
// START SERVER
// ──────────────────────────────────────────────────────────────────────────────
async function start() {
  // Initialize DB
  getDb();

  // Start scheduler
  try {
    const { startScheduler } = require('./backend/scheduler/jobs');
    startScheduler();
  } catch(e) {
    console.error('[server] Scheduler failed to start:', e.message);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Manthan Agency OS running at http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Frontend:    http://localhost:${PORT}`);
    console.log(`   API:         http://localhost:${PORT}/api\n`);
  });
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
