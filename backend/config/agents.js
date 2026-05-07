'use strict';

/**
 * Registry of all Manthan AI Agency agents.
 * Each entry defines the agent's identity, tier, allowed tools, and model.
 *
 * Tiers:
 *   1 — Orchestrator (router)
 *   2 — Client-facing intelligence (brand, leads, outreach, morning brief)
 *   3 — Content & research (market intel, hooks, captions, etc.)
 *   4 — Operations & growth (SOPs, finance, onboarding, upsell)
 *   5 — QA & compliance (delivery-qa, brand-voice-guard)
 */

const AGENTS = [
  {
    name: 'orchestrator',
    displayName: 'Manthan Orchestrator',
    description: 'Top-level router that understands user intent and delegates tasks to the appropriate specialist agent. Manages multi-agent workflows and synthesizes final responses.',
    tier: 1,
    tools: ['all'],
    model: 'claude-sonnet-4-6',
    maxTokens: 8192
  },
  {
    name: 'brand-intelligence',
    displayName: 'Brand Intelligence Agent',
    description: 'Builds deep brand profiles by researching the client\'s industry, competitors, audience, and USP. Saves structured brand profiles to Airtable and Notion for use by content agents.',
    tier: 2,
    tools: ['web_search', 'scrape_url', 'airtable_read', 'notion_create_page'],
    model: 'claude-sonnet-4-6',
    maxTokens: 8192
  },
  {
    name: 'lead-qualifier',
    displayName: 'Lead Qualifier Agent',
    description: 'Evaluates inbound and scraped leads. Researches their online presence, scores them by AI-readiness and revenue potential, and updates Airtable with qualification data.',
    tier: 2,
    tools: ['web_search', 'scrape_url', 'airtable_read', 'airtable_update'],
    model: 'claude-sonnet-4-6',
    maxTokens: 4096
  },
  {
    name: 'content-strategy',
    displayName: 'Content Strategy Agent',
    description: 'Creates monthly content plans and calendars for clients based on brand profiles, industry trends, and platform best practices. Stores plans in Airtable Content Calendar.',
    tier: 2,
    tools: ['web_search', 'airtable_read', 'airtable_create', 'notion_create_page'],
    model: 'claude-sonnet-4-6',
    maxTokens: 8192
  },
  {
    name: 'outreach',
    displayName: 'Lead Outreach Agent',
    description: 'Executes personalized outreach sequences for qualified leads via email and WhatsApp. Tracks outreach history in Airtable and crafts context-aware follow-up messages.',
    tier: 2,
    tools: ['web_search', 'airtable_read', 'airtable_update', 'send_email', 'whatsapp_send'],
    model: 'claude-sonnet-4-6',
    maxTokens: 4096
  },
  {
    name: 'morning-brief',
    displayName: 'Morning Brief Agent',
    description: 'Runs every morning to generate a comprehensive daily brief: today\'s calendar events, pending deliverables, approval queue status, overdue invoices, and priority tasks. Sends via WhatsApp.',
    tier: 2,
    tools: ['calendar_read', 'airtable_read', 'whatsapp_send', 'notion_create_page'],
    model: 'claude-sonnet-4-6',
    maxTokens: 4096
  },
  {
    name: 'delivery-qa',
    displayName: 'Delivery QA Agent',
    description: 'Reviews deliverables before client submission. Checks for brand voice compliance, grammar, platform-specific formatting, and completeness. Flags issues and updates Airtable status.',
    tier: 5,
    tools: ['airtable_read', 'airtable_update'],
    model: 'claude-sonnet-4-6',
    maxTokens: 8192
  },
  {
    name: 'brand-voice-guard',
    displayName: 'Brand Voice Guard Agent',
    description: 'Audits content against brand profiles to ensure tone, vocabulary, and messaging align with the client\'s brand guidelines. Prevents off-brand content from reaching clients.',
    tier: 5,
    tools: ['airtable_read'],
    model: 'claude-sonnet-4-6',
    maxTokens: 4096
  },
  {
    name: 'market-intel',
    displayName: 'Market Intelligence Agent',
    description: 'Conducts deep market research on industries, trends, and opportunities. Produces structured intelligence reports saved to Notion for use in strategy sessions.',
    tier: 3,
    tools: ['web_search', 'scrape_url', 'notion_create_page'],
    model: 'claude-sonnet-4-6',
    maxTokens: 8192
  },
  {
    name: 'competitor-watch',
    displayName: 'Competitor Watch Agent',
    description: 'Monitors competitor activity across digital channels. Analyzes their content, positioning, ads, and reviews to surface insights for client strategy.',
    tier: 3,
    tools: ['web_search', 'scrape_url', 'airtable_read'],
    model: 'claude-sonnet-4-6',
    maxTokens: 6144
  },
  {
    name: 'hook-writer',
    displayName: 'Hook Writer Agent',
    description: 'Generates high-converting hooks, opening lines, and attention-grabbing intros for social media posts, reels, and ads. Trained on viral content patterns per platform.',
    tier: 3,
    tools: ['web_search', 'airtable_read', 'save_file'],
    model: 'claude-sonnet-4-6',
    maxTokens: 4096
  },
  {
    name: 'caption-writer',
    displayName: 'Caption Writer Agent',
    description: 'Writes platform-optimized captions for Instagram, LinkedIn, Facebook, and WhatsApp. Applies brand voice, relevant hashtags, and engagement CTAs based on brand profiles.',
    tier: 3,
    tools: ['airtable_read', 'save_file'],
    model: 'claude-sonnet-4-6',
    maxTokens: 4096
  },
  {
    name: 'email-writer',
    displayName: 'Email Writer Agent',
    description: 'Crafts professional email campaigns, newsletters, nurture sequences, and outreach templates. Balances brand voice with conversion-focused copywriting principles.',
    tier: 3,
    tools: ['airtable_read', 'save_file'],
    model: 'claude-sonnet-4-6',
    maxTokens: 6144
  },
  {
    name: 'repurposing',
    displayName: 'Content Repurposing Agent',
    description: 'Transforms existing content into multiple formats and platforms. Converts blog posts to LinkedIn carousels, reels scripts to Twitter threads, webinars to email sequences, etc.',
    tier: 3,
    tools: ['airtable_read', 'save_file'],
    model: 'claude-sonnet-4-6',
    maxTokens: 6144
  },
  {
    name: 'sop-generator',
    displayName: 'SOP Generator Agent',
    description: 'Documents internal processes and client-specific standard operating procedures. Creates structured SOPs in Notion for onboarding, delivery, approval, and reporting workflows.',
    tier: 4,
    tools: ['airtable_read', 'notion_create_page', 'save_file'],
    model: 'claude-sonnet-4-6',
    maxTokens: 8192
  },
  {
    name: 'finance-tracker',
    displayName: 'Finance Tracker Agent',
    description: 'Monitors agency financials: invoice status, outstanding payments, monthly recurring revenue, and client contract renewals. Generates financial summaries and alerts.',
    tier: 4,
    tools: ['airtable_read', 'notion_create_page'],
    model: 'claude-sonnet-4-6',
    maxTokens: 4096
  },
  {
    name: 'knowledge-capture',
    displayName: 'Knowledge Capture Agent',
    description: 'Extracts learnings from completed campaigns, client feedback, and project retrospectives. Builds an agency knowledge base in Notion to improve future work.',
    tier: 4,
    tools: ['airtable_read', 'notion_create_page', 'save_file'],
    model: 'claude-sonnet-4-6',
    maxTokens: 6144
  },
  {
    name: 'client-onboarding',
    displayName: 'Client Onboarding Agent',
    description: 'Handles end-to-end onboarding of new clients: creates Airtable records, Notion pages, sends welcome WhatsApp, and triggers the n8n onboarding workflow. Sets up brand profile intake.',
    tier: 4,
    tools: ['airtable_create', 'notion_create_page', 'whatsapp_send', 'n8n_trigger'],
    model: 'claude-sonnet-4-6',
    maxTokens: 4096
  },
  {
    name: 'upsell-detector',
    displayName: 'Upsell Detector Agent',
    description: 'Analyzes active client data to identify upsell and cross-sell opportunities. Detects signals like low platform coverage, content gaps, or high engagement that warrant expanded services.',
    tier: 4,
    tools: ['airtable_read', 'whatsapp_send'],
    model: 'claude-sonnet-4-6',
    maxTokens: 4096
  },
  {
    name: 'brief-to-deliverable',
    displayName: 'Brief to Deliverable Agent',
    description: 'Converts content briefs into fully drafted deliverables. Reads brief from Airtable, generates the content, and creates a new Deliverable record ready for QA review.',
    tier: 4,
    tools: ['airtable_read', 'airtable_create'],
    model: 'claude-sonnet-4-6',
    maxTokens: 8192
  },
  {
    name: 'crisis-monitor',
    displayName: 'Crisis Monitor Agent',
    description: 'Monitors brand mentions, news, and social signals for potential PR crises or reputation risks for clients. Sends immediate WhatsApp alerts if critical issues are detected.',
    tier: 3,
    tools: ['web_search', 'whatsapp_send'],
    model: 'claude-sonnet-4-6',
    maxTokens: 4096
  },
  {
    name: 'system-auditor',
    displayName: 'System Auditor Agent',
    description: 'Performs weekly audits of the Manthan OS: checks n8n workflow health, Airtable data integrity, pending approvals, overdue deliverables, and system performance. Reports via WhatsApp and Notion.',
    tier: 4,
    tools: ['whatsapp_send', 'notion_create_page'],
    model: 'claude-sonnet-4-6',
    maxTokens: 4096
  }
];

/**
 * Get agent config by name.
 * @param {string} name - Agent name slug
 * @returns {Object|null}
 */
function getAgent(name) {
  return AGENTS.find(a => a.name === name) || null;
}

/**
 * Get all agents for a given tier.
 * @param {number} tier
 * @returns {Array}
 */
function getAgentsByTier(tier) {
  return AGENTS.filter(a => a.tier === tier);
}

module.exports = AGENTS;
module.exports.getAgent = getAgent;
module.exports.getAgentsByTier = getAgentsByTier;
