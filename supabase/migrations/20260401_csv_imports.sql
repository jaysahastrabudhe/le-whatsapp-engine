-- Audit log for CSV imports and exports
CREATE TABLE IF NOT EXISTS csv_imports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'reply_import',   -- 'reply_import' or 'failed_export'
  filename TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  imported_by TEXT DEFAULT 'admin',
  details JSONB DEFAULT '[]'::jsonb,           -- per-row results for audit
  created_at TIMESTAMPTZ DEFAULT now()
);
