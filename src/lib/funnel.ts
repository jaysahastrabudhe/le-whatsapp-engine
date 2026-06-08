// Multi-stage funnel model (from Funnel_Algorithm.pdf).
// Stages are Zoho Lead_Stage picklist values; Cold/Junk are engagement end-states (wa_state).

export const FUNNEL_STAGES = ['MQL', 'MQL+', 'MQL++', 'MQL+++', 'SQL'] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

// Stages an operator can move a lead into via the "Move to stage" control.
export const MOVABLE_STAGES: string[] = ['MQL', 'MQL+', 'MQL++', 'MQL+++', 'SQL'];

// Engagement end-states (stored in wa_state).
export const WA_COLD = 'wa_cold';   // no pickup after 3 attempts — re-engageable
export const WA_JUNK = 'wa_junk';   // negative response — disqualified
export const NO_ANSWER_LIMIT = 3;   // no-answer ×3 → Cold

// A positive CALL advances the lead one rung toward SQL.
// MQL / MQL+ / MQL++  --positive call-->  MQL+++   (Gargi's decision box)
// MQL+++              --confirm-------->  SQL       (discovery booked / won)
export function positiveCallTarget(currentStage: string | null): FunnelStage {
  if (currentStage === 'MQL+++') return 'SQL';
  return 'MQL+++';
}

// wa_state that backs each funnel stage in the SLA-monitor boxes. Defined for EVERY
// movable stage so a manual "move to stage" always lands the lead in exactly one box
// (a stale engaged wa_state would otherwise orphan it or double-list it).
export function waStateForStage(stage: string): string | null {
  switch (stage) {
    case 'MQL':    return 'wa_pending';         // Sharjeel cold-outreach box
    case 'MQL+':   return 'replied';            // Gargi inbound box (genuine reply)
    case 'MQL++':  return 'replied_manual';     // Gargi inbound box (manual/organic)
    case 'MQL+++': return 'discovery_call';     // box 3 — Gargi decides
    case 'SQL':    return 'wa_sla_resolved';    // won / discovery booked
    default:       return null;
  }
}
