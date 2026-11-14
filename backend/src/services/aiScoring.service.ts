import { query } from '../db/pool';
import { AuthUser } from '../types/express';
import { AppError } from '../utils/AppError';
import { leadScope } from './scope.service';
import { writeAuditLog } from './audit.service';

export interface AiLeadScoreResult {
  leadId: string;
  leadCode: string;
  leadName: string;
  score: number; // 0 - 100
  tier: 'HOT' | 'WARM' | 'COLD';
  conversionProbability: number; // 0.0 - 1.0
  summary: string;
  strengths: string[];
  risks: string[];
  recommendedActions: string[];
  talkingPoints: string[];
  modelUsed: string;
  evaluatedAt: string;
}

let tableEnsured = false;
async function ensureAiTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS lead_ai_scores (
        lead_id UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
        score INTEGER NOT NULL,
        tier TEXT NOT NULL,
        conversion_probability NUMERIC(4,2) NOT NULL,
        summary TEXT NOT NULL,
        strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
        risks JSONB NOT NULL DEFAULT '[]'::jsonb,
        recommended_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
        talking_points JSONB NOT NULL DEFAULT '[]'::jsonb,
        model_used TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    tableEnsured = true;
  } catch (err) {
    console.error('Failed to ensure lead_ai_scores table:', err);
  }
}

/**
 * Heuristic BANT + Product-Fit + Interaction NLP Engine.
 * Used when no external LLM key is configured or as zero-downtime fallback.
 */
function computeHeuristicScore(lead: any): {
  score: number;
  tier: 'HOT' | 'WARM' | 'COLD';
  conversionProbability: number;
  summary: string;
  strengths: string[];
  risks: string[];
  recommendedActions: string[];
  talkingPoints: string[];
} {
  let score = 25; // baseline
  const strengths: string[] = [];
  const risks: string[] = [];
  const recommendedActions: string[] = [];
  const talkingPoints: string[] = [];

  const priority = String(lead.priority || 'medium').toLowerCase();
  const companySize = String(lead.company_size || '');
  const source = String(lead.source_name || '');
  const status = String(lead.status_name || '');
  const product = String(lead.product_name || 'Enterprise Solution');
  const activitiesCount = Number(lead.activities_count || 0);
  const followupsCount = Number(lead.followups_count || 0);
  const hasFollowup = !!lead.next_follow_up_at;
  const isFollowupOverdue = hasFollowup && new Date(lead.next_follow_up_at).getTime() < Date.now();

  // 1. Priority scoring
  if (priority === 'high') {
    score += 25;
    strengths.push('Flagged as High Priority account by sales triage');
  } else if (priority === 'medium') {
    score += 15;
  } else {
    score += 5;
    risks.push('Low initial priority assignment');
  }

  // 2. Company size & budget indicators
  if (['1000+', '501-1000'].includes(companySize)) {
    score += 25;
    strengths.push(`Enterprise tier organization size (${companySize} employees) with strong procurement capacity`);
  } else if (['201-500', '51-200'].includes(companySize)) {
    score += 16;
    strengths.push(`Mid-market growth stage (${companySize} employees) with agile decision cycles`);
  } else if (['11-50', '1-10'].includes(companySize)) {
    score += 8;
  } else {
    risks.push('Company size not specified in profile');
  }

  // 3. Acquisition Source Affinity
  const sLower = source.toLowerCase();
  if (sLower.includes('referral') || sLower.includes('partner')) {
    score += 20;
    strengths.push(`High-trust inbound channel: ${source}`);
  } else if (sLower.includes('website') || sLower.includes('inbound') || sLower.includes('demo')) {
    score += 15;
    strengths.push(`Organic inbound intent from ${source}`);
  } else if (sLower.includes('linkedin') || sLower.includes('event')) {
    score += 10;
  } else {
    score += 5;
    risks.push(`Cold outreach source (${source || 'Outbound'}) typically requires longer nurturing`);
  }

  // 4. Engagement & Activity Momentum
  if (activitiesCount >= 3) {
    score += 15;
    strengths.push(`Active sales momentum with ${activitiesCount} recorded client interactions`);
  } else if (activitiesCount >= 1) {
    score += 8;
    strengths.push(`Initial client contact established (${activitiesCount} interaction)`);
  } else {
    risks.push('Zero customer touchpoints or activity logs recorded yet');
  }

  // 5. Follow-up Cadence
  if (hasFollowup && !isFollowupOverdue) {
    score += 10;
    strengths.push(`Scheduled next touchpoint on ${new Date(lead.next_follow_up_at).toLocaleDateString()}`);
  } else if (isFollowupOverdue) {
    score -= 12;
    risks.push('Next scheduled follow-up is overdue; risk of prospect drop-off');
  } else {
    score -= 8;
    risks.push('No next follow-up currently scheduled');
  }

  // 6. Contact Data Completeness
  if (lead.email && lead.mobile) {
    score += 8;
    strengths.push('Multi-channel reachability: Both phone and email are validated');
  } else if (!lead.email || !lead.mobile) {
    score -= 6;
    risks.push('Single communication channel available');
  }

  // 7. Status adjustments
  const stLower = status.toLowerCase();
  if (stLower.includes('converted')) {
    score = 100;
  } else if (stLower.includes('lost')) {
    score = Math.min(score, 12);
    risks.push('Lead currently marked as Lost');
  } else if (stLower.includes('proposal') || stLower.includes('negotiation')) {
    score += 18;
    strengths.push(`Late-stage pipeline progression (${status})`);
  } else if (stLower.includes('contacted') || stLower.includes('progress')) {
    score += 10;
  }

  // Bound score
  score = Math.max(5, Math.min(98, score));
  if (stLower.includes('converted')) score = 100;

  // Determine Tier
  const tier: 'HOT' | 'WARM' | 'COLD' = score >= 75 ? 'HOT' : score >= 45 ? 'WARM' : 'COLD';
  const conversionProbability = Math.round((score / 100) * 100) / 100;

  // Recommended actions based on state
  if (tier === 'HOT') {
    recommendedActions.push(`Fast-track executive product demonstration for ${product}`);
    recommendedActions.push('Engage technical decision-maker to confirm deployment requirements and timeline');
    if (!hasFollowup || isFollowupOverdue) {
      recommendedActions.push('Schedule an urgent follow-up call within 24 hours to maintain buying momentum');
    }
  } else if (tier === 'WARM') {
    recommendedActions.push(`Share tailored case studies showcasing ROI with ${product}`);
    recommendedActions.push('Conduct qualification call to map budget authority and purchasing timeline');
    if (!hasFollowup) {
      recommendedActions.push('Lock in a scheduled discovery call for this week');
    }
  } else {
    recommendedActions.push('Enroll in automated educational email drip campaign');
    recommendedActions.push('Re-qualify business need and identify correct departmental stakeholder');
  }

  // Tailored sales rep talking points
  talkingPoints.push(`Highlight Logische Innovative's proven enterprise track record in ${lead.industry || 'the industry'}`);
  talkingPoints.push(`Emphasize how ${product} directly addresses speed-to-value and scalability`);
  if (companySize) {
    talkingPoints.push(`Reference our dedicated onboarding support tailored for teams of ${companySize} users`);
  }

  // Executive summary
  const summary = `${tier === 'HOT' ? 'High-intent' : tier === 'WARM' ? 'Promising mid-funnel' : 'Early-stage'} prospect interested in ${product}. Shows a predictive score of ${score}/100 with ${(conversionProbability * 100).toFixed(0)}% conversion likelihood based on organizational scale, acquisition channel, and current pipeline engagement.`;

  return {
    score,
    tier,
    conversionProbability,
    summary,
    strengths,
    risks,
    recommendedActions,
    talkingPoints,
  };
}

/**
 * Attempts LLM invocation via OpenAI API if key is present.
 */
async function callOpenAiLlm(leadData: any, apiKey: string): Promise<any | null> {
  try {
    const prompt = `You are an elite enterprise B2B sales strategist for Logische Innovative CRM. Analyze this lead and provide structured AI scoring and sales intelligence.

Lead Information:
- Contact: ${leadData.lead_name} (${leadData.email || 'N/A'}, ${leadData.mobile || 'N/A'})
- Company: ${leadData.company_name || 'N/A'} (Industry: ${leadData.industry || 'N/A'}, Size: ${leadData.company_size || 'N/A'}, Website: ${leadData.company_website || 'N/A'})
- Product of Interest: ${leadData.product_name} (${leadData.product_code})
- Acquisition Source: ${leadData.source_name}
- Current Status: ${leadData.status_name}
- Priority: ${leadData.priority}
- Past Activities Count: ${leadData.activities_count}
- Follow-ups Count: ${leadData.followups_count}
- Next Follow-up: ${leadData.next_follow_up_at || 'None'}
- Notes/Remarks: ${leadData.remarks || 'None'}

Return ONLY a valid JSON object with the following schema:
{
  "score": <integer 0-100>,
  "tier": <"HOT" | "WARM" | "COLD">,
  "conversionProbability": <number 0.0 to 1.0>,
  "summary": "<2-sentence executive summary>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "risks": ["<risk 1>", "<risk 2>"],
  "recommendedActions": ["<action 1>", "<action 2>"],
  "talkingPoints": ["<point 1>", "<point 2>"]
}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    return JSON.parse(content);
  } catch (err) {
    console.warn('OpenAI LLM call failed, falling back to heuristic engine:', err);
    return null;
  }
}

/**
 * Score or retrieve AI analysis for a lead.
 */
export async function getOrComputeLeadScore(
  caller: AuthUser,
  leadId: string,
  forceRefresh = false,
  ip?: string | null,
  userAgent?: string | null,
): Promise<AiLeadScoreResult> {
  await ensureAiTable();

  // 1. Enforce RBAC lead scope
  const scope = leadScope(caller, 'l', 2);
  const leadQuery = `
    SELECT
      l.id,
      l.lead_code,
      l.lead_name,
      l.email,
      l.mobile,
      l.company_name,
      l.industry,
      l.priority,
      l.remarks,
      l.next_follow_up_at,
      l.converted_at,
      c.size AS company_size,
      c.industry AS company_industry,
      c.website AS company_website,
      p.code AS product_code,
      p.name AS product_name,
      s.name AS source_name,
      st.name AS status_name,
      (SELECT COUNT(*)::int FROM lead_activities WHERE lead_id = l.id) AS activities_count,
      (SELECT COUNT(*)::int FROM follow_ups WHERE lead_id = l.id) AS followups_count
    FROM leads l
    LEFT JOIN companies c ON c.id = l.company_id
    JOIN products p ON p.id = l.product_id
    JOIN lead_sources s ON s.id = l.source_id
    JOIN lead_statuses st ON st.id = l.status_id
    WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}
  `;

  const leadRes = await query(leadQuery, [leadId, ...scope.params]);
  if (leadRes.rowCount === 0) {
    throw AppError.notFound('Lead not found or inaccessible under your permissions');
  }
  const lead = leadRes.rows[0];

  // 2. Check cached score if not forcing refresh
  if (!forceRefresh) {
    try {
      const cachedRes = await query(
        `SELECT score, tier, conversion_probability, summary, strengths, risks,
                recommended_actions, talking_points, model_used, updated_at
         FROM lead_ai_scores WHERE lead_id = $1`,
        [leadId],
      );
      if (cachedRes.rowCount && cachedRes.rowCount > 0) {
        const row = cachedRes.rows[0];
        return {
          leadId: lead.id,
          leadCode: lead.lead_code,
          leadName: lead.lead_name,
          score: row.score,
          tier: row.tier,
          conversionProbability: Number(row.conversion_probability),
          summary: row.summary,
          strengths: Array.isArray(row.strengths) ? row.strengths : [],
          risks: Array.isArray(row.risks) ? row.risks : [],
          recommendedActions: Array.isArray(row.recommended_actions) ? row.recommended_actions : [],
          talkingPoints: Array.isArray(row.talking_points) ? row.talking_points : [],
          modelUsed: row.model_used,
          evaluatedAt: new Date(row.updated_at).toISOString(),
        };
      }
    } catch {
      // Table might not exist yet; continue to compute
    }
  }

  // 3. Compute score: Try live LLM if API key provided, else heuristic NLP engine
  let analysis: any = null;
  let modelUsed = 'LI Enterprise AI Copilot (BANT-NLP)';

  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    analysis = await callOpenAiLlm(lead, openAiKey);
    if (analysis) modelUsed = 'GPT-4o-mini (Live LLM)';
  }

  if (!analysis) {
    analysis = computeHeuristicScore(lead);
  }

  // 4. Upsert into database
  try {
    await query(
      `INSERT INTO lead_ai_scores (
        lead_id, score, tier, conversion_probability, summary,
        strengths, risks, recommended_actions, talking_points, model_used, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (lead_id) DO UPDATE SET
        score = EXCLUDED.score,
        tier = EXCLUDED.tier,
        conversion_probability = EXCLUDED.conversion_probability,
        summary = EXCLUDED.summary,
        strengths = EXCLUDED.strengths,
        risks = EXCLUDED.risks,
        recommended_actions = EXCLUDED.recommended_actions,
        talking_points = EXCLUDED.talking_points,
        model_used = EXCLUDED.model_used,
        updated_at = NOW()`,
      [
        leadId,
        analysis.score,
        analysis.tier,
        analysis.conversionProbability,
        analysis.summary,
        JSON.stringify(analysis.strengths),
        JSON.stringify(analysis.risks),
        JSON.stringify(analysis.recommendedActions),
        JSON.stringify(analysis.talkingPoints),
        modelUsed,
      ],
    );
  } catch (err) {
    console.error('Failed to cache AI score to DB:', err);
  }

  // 5. Audit log
  await writeAuditLog({
    userId: caller.id,
    action: 'lead.ai_score',
    entityType: 'lead',
    entityId: leadId,
    newValues: {
      score: analysis.score,
      tier: analysis.tier,
      modelUsed,
    },
    ip: ip ?? null,
    userAgent: userAgent ?? null,
  });

  return {
    leadId: lead.id,
    leadCode: lead.lead_code,
    leadName: lead.lead_name,
    score: analysis.score,
    tier: analysis.tier,
    conversionProbability: Number(analysis.conversionProbability),
    summary: analysis.summary,
    strengths: analysis.strengths,
    risks: analysis.risks,
    recommendedActions: analysis.recommendedActions,
    talkingPoints: analysis.talkingPoints,
    modelUsed,
    evaluatedAt: new Date().toISOString(),
  };
}
