-- Follow-up rule configuration — single-row table
CREATE TABLE IF NOT EXISTS public.followup_config (
    id              INT PRIMARY KEY DEFAULT 1,
    rule5_enabled   BOOLEAN     NOT NULL DEFAULT true,
    rule5_delay_hours INT       NOT NULL DEFAULT 24,
    rule5_template  TEXT        NOT NULL DEFAULT 'wa_followup_1',
    rule6_enabled   BOOLEAN     NOT NULL DEFAULT true,
    rule6_delay_hours INT       NOT NULL DEFAULT 48,
    rule6a_template TEXT        NOT NULL DEFAULT 'wa_track_selector',
    rule6b_template TEXT        NOT NULL DEFAULT 'wa_followup_2_quickreply',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Seed the single config row
INSERT INTO public.followup_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
