# Manthan Agency OS — Build Progress

## Project
World-class AI Agency OS for Manthan AI Agency (solo founder Yash, Bengaluru).
Branch: claude/console-api-integration-SM88c
Stack: Node.js 20 + Express + SQLite + Anthropic SDK + Vanilla HTML SPA

## VERIFIED RECON DATA (do not re-fetch)

### Airtable
- Base ID: appE95FlXiPgMU1nT (name: "AI Agency")
- Tables:
  - Leads: tblPBN2DAzPZWGIqi
  - Clients: tblsbEvp96erYwMnB
  - Invoices: tbl4f8NWJJWYt3TIJ
  - Projects: tblH5RVV3WZQNrCHM
  - Brand Profiles: tbl4iEqL8dWtvyF8l
  - Agency Growth: tblQRikW69V0tfen4
  - Deliverables: tblHwdA2kpxHyENkY
  - Approval Queue: tbliecVSKPrl3SCXq
  - Content Calendar: tbl4Vts1muUEwN2qc

### n8n
- Base URL: https://ykaiagency.app.n8n.cloud
- Workflow IDs:
  - NsVR86ZodMaC8Ack — WhatsApp AI Agent
  - towKjut9ux0BwUnj — Morning Brief Generator
  - CV4YMAvaaDCuFig4 — Weekly Agency Health Report
  - BKet8msklcbckTE6 — Lead Outreach Sequencer
  - GezcMF6nkJRgxovB — Automation Health Monitor
  - p8JpjvqLWI4PdaT1 — Approval Queue Notifier
  - yyylX0KIbIQhUmcB — Client Onboarding Flow

### Notion
- DB ID: 42802614-45ca-44b4-88b4-c4ded6f8719d
- Collection ID: ad48269d-4ffe-45a2-97ba-78beffaf3d1b
- Schema: Client Name (title), Status, Monthly Retainer (₹), Platforms, Start Date, Contract End, Primary Contact, Notes

### Google Calendar
- Primary ID: yashsingh328@gmail.com
- Timezone: Asia/Kolkata

### WhatsApp
- Phone Number ID: 1015871981620582
- Yash's number: 918875566031

## ARCHITECTURE

```
/home/user/Manthan-AI-Agency/
├── package.json          ✅ DONE
├── .env.example          ✅ DONE
├── .gitignore            ✅ DONE
├── CLAUDE.md             ✅ DONE (this file)
├── server.js             ✅ DONE (30+ routes, SSE, webhooks)
├── backend/
│   ├── memory/
│   │   ├── db.js                    ✅ DONE (12 tables)
│   │   ├── conversation-store.js    ⏳ Subagent A
│   │   ├── agent-memory.js          ⏳ Subagent A
│   │   └── client-context.js        ⏳ Subagent A
│   ├── tools/
│   │   ├── web-search.js            ⏳ Subagent A
│   │   ├── url-scraper.js           ⏳ Subagent A
│   │   ├── airtable.js              ⏳ Subagent A
│   │   ├── n8n.js                   ⏳ Subagent A
│   │   ├── notion.js                ⏳ Subagent A
│   │   ├── file-generator.js        ⏳ Subagent A
│   │   ├── calendar.js              ⏳ Subagent A
│   │   ├── whatsapp.js              ⏳ Subagent A
│   │   ├── whatsapp-webhook.js      ⏳ Subagent A
│   │   ├── pdf-generator.js         ⏳ Subagent A
│   │   └── email-sender.js          ⏳ Subagent A
│   ├── config/
│   │   ├── clients.js               ⏳ Subagent A (empty array)
│   │   └── agents.js                ⏳ Subagent A (23 agent registry)
│   ├── agents/
│   │   ├── runner.js                ✅ DONE (agentic loop + streaming)
│   │   ├── orchestrator.js          ⏳ Subagent B
│   │   ├── system-auditor.js        ⏳ Subagent B
│   │   ├── brand-intelligence.js    ⏳ Subagent B
│   │   ├── lead-qualifier.js        ⏳ Subagent B
│   │   ├── content-strategy.js      ⏳ Subagent B
│   │   ├── outreach.js              ⏳ Subagent B
│   │   ├── morning-brief.js         ⏳ Subagent B
│   │   ├── delivery-qa.js           ⏳ Subagent B
│   │   ├── brand-voice-guard.js     ⏳ Subagent B
│   │   ├── market-intel.js          ⏳ Subagent B
│   │   ├── competitor-watch.js      ⏳ Subagent B
│   │   ├── hook-writer.js           ⏳ Subagent B
│   │   ├── caption-writer.js        ⏳ Subagent B
│   │   ├── email-writer.js          ⏳ Subagent B
│   │   ├── repurposing.js           ⏳ Subagent B
│   │   ├── sop-generator.js         ⏳ Subagent B
│   │   ├── finance-tracker.js       ⏳ Subagent B
│   │   ├── knowledge-capture.js     ⏳ Subagent B
│   │   ├── client-onboarding.js     ⏳ Subagent B
│   │   ├── upsell-detector.js       ⏳ Subagent B
│   │   ├── brief-to-deliverable.js  ⏳ Subagent B
│   │   └── crisis-monitor.js        ⏳ Subagent B
│   └── scheduler/
│       └── jobs.js                  ✅ DONE (9 cron jobs)
└── frontend/
    ├── index.html                   ⏳ TODO
    └── assets/
        └── styles.css               ⏳ TODO
```

## DESIGN SYSTEM: "OBSIDIAN"

### Color Tokens
```
--void:       #020206   background
--surface-1:  #08080f   sidebar, topbar
--surface-2:  #0d0d18   cards, panels
--surface-3:  #121224   hover states
--surface-4:  #171730   modals, dropdowns
--border:         #1a1a2e
--border-strong:  #252540
--accent:         #4F6EF7   primary blue
--accent-hover:   #3B5BDB
--accent-muted:   rgba(79,110,247,0.12)
--gold:           #F4B942   revenue/success
--emerald:        #34C759
--amber:          #FF9F0A
--rose:           #FF375F
--text-1:  #F0F0FA   primary
--text-2:  #8888A8   secondary
--text-3:  #50506A   muted
```

## SCHEDULER BEHAVIOR (important)
- Approval Queue Notifier: every hour — alerts if ANY pending approvals. Silent if clear.
- Automation Health Monitor: every 2h — ONLY alerts if workflow broken. Silent when healthy.

## CLIENT GRADIENT PRESETS (8 options, auto-assigned on onboarding)
```
1: linear-gradient(135deg, #4ade80, #22c55e)   green
2: linear-gradient(135deg, #4F6EF7, #7C3AED)   blue-violet
3: linear-gradient(135deg, #f472b6, #e879f9)   rose-fuchsia
4: linear-gradient(135deg, #a16207, #d97706)   amber-gold
5: linear-gradient(135deg, #06b6d4, #0284c7)   ocean blue
6: linear-gradient(135deg, #f97316, #ef4444)   sunset red
7: linear-gradient(135deg, #a855f7, #6366f1)   violet
8: linear-gradient(135deg, #10b981, #0d9488)   teal
```

## TO RESUME THIS SESSION
If session died, check git status to see which files exist.
Run: ls backend/tools/ backend/agents/ frontend/
If frontend/index.html is missing → that's the next and final task.
If any backend files are missing → re-run the relevant subagent.
npm install && node server.js to test.

## NEXT SESSION STARTING POINT (if needed)
1. npm install (in /home/user/Manthan-AI-Agency/)
2. Verify backend files exist (ls -la backend/tools/ backend/agents/)
3. If tools/agents missing: re-write them (use recon data above)
4. Write frontend/assets/styles.css (Obsidian design system)
5. Write frontend/index.html (19 screens, Obsidian design)
6. git add . && git commit && git push origin claude/console-api-integration-SM88c
