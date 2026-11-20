-- Agendamentos de Visita Técnica enviados pelo site público (refrimaqrs.com.br)
-- Segurança LGPD: papel público (anon) tem APENAS INSERT (nunca SELECT/UPDATE/DELETE).

CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_code text NOT NULL UNIQUE,
  activity_type text NOT NULL CHECK (activity_type IN ('corretivo', 'sanitizacao', 'projeto_instalacao')),
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_contato', 'agendado', 'convertido_os', 'concluido', 'cancelado')),
  urgency text NOT NULL DEFAULT 'media' CHECK (urgency IN ('alta', 'media', 'baixa')),
  customer_name text NOT NULL,
  company_name text NOT NULL DEFAULT '',
  phone text NOT NULL,
  phone_digits text NOT NULL,
  city text NOT NULL,
  address text NOT NULL DEFAULT '',
  preferred_date date,
  preferred_period text NOT NULL DEFAULT 'qualquer',
  questionnaire jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_text text NOT NULL DEFAULT '',
  internal_notes text NOT NULL DEFAULT '',
  converted_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  converted_order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_status_created
  ON public.service_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_requests_activity
  ON public.service_requests (activity_type);

CREATE INDEX IF NOT EXISTS idx_service_requests_phone_digits
  ON public.service_requests (phone_digits);

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_requests_anon_insert" ON public.service_requests;
CREATE POLICY "service_requests_anon_insert"
  ON public.service_requests
  FOR INSERT
  TO anon
  WITH CHECK (
    length(trim(customer_name)) >= 2
    AND length(trim(phone_digits)) >= 10
    AND length(trim(city)) >= 2
  );

DROP POLICY IF EXISTS "service_requests_auth_select" ON public.service_requests;
CREATE POLICY "service_requests_auth_select"
  ON public.service_requests
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "service_requests_auth_insert" ON public.service_requests;
CREATE POLICY "service_requests_auth_insert"
  ON public.service_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_requests_auth_update" ON public.service_requests;
CREATE POLICY "service_requests_auth_update"
  ON public.service_requests
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_requests_auth_delete" ON public.service_requests;
CREATE POLICY "service_requests_auth_delete"
  ON public.service_requests
  FOR DELETE
  TO authenticated
  USING (true);
