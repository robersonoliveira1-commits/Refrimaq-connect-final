-- Separate operational and financial status on service_orders
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS status_financeiro text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS data_conclusao timestamptz;

-- Backfill: OS already marked as Concluída with paid_at → set financeiro = 'pago'
UPDATE service_orders
SET status_financeiro = 'pago'
WHERE status = 'Concluída' AND paid_at IS NOT NULL;

-- For OS Concluída without paid_at → financeiro = 'pendente' (already default)

-- Index for financial module queries
CREATE INDEX IF NOT EXISTS idx_service_orders_status_fin ON service_orders(status_financeiro);
