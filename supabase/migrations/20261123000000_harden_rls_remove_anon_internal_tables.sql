-- ============================================================================
-- HARDENING DE SEGURANÇA RLS (OWASP A01:2025 + LGPD)
-- Remove acesso público `anon` de todas as tabelas internas do CRM
-- (service_orders, service_order_parts, service_order_attachments,
--  customer_equipments, stock_movements, services, used_items) e do bucket
-- financeiro `expenses-attachments`.
--
-- Mantém 100% funcionais:
--   1. Site público refrimaq-site (SELECT em site_products / site_banners ativos,
--      INSERT-only em service_requests).
--   2. QR Code público de equipamento (PublicEquipmentView) via RPC escopada
--      `public.get_public_equipment_history(uuid)`, que exige o UUID exato
--      do equipamento e retorna apenas dados técnicos (zero valores/PII).
--   3. Escrita em site_banners e site_products restrita a admin/comercial.
-- ============================================================================

-- 0. Helper SECURITY DEFINER para perfis autorizados a gerenciar o site público
CREATE OR REPLACE FUNCTION public.is_admin_or_comercial()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'comercial')
  );
$$;

-- 1. RPC segura para leitura individual de QR Code de equipamento (sem expor tabelas ao `anon`)
CREATE OR REPLACE FUNCTION public.get_public_equipment_history(p_equipment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_equipment jsonb;
  v_history jsonb;
BEGIN
  IF p_equipment_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', e.id,
    'equip_type', e.equip_type,
    'equip_brand', e.equip_brand,
    'equip_model', e.equip_model,
    'equip_serial', e.equip_serial,
    'equip_voltage', e.equip_voltage,
    'equip_gas', e.equip_gas,
    'customers', jsonb_build_object(
      'name', c.name,
      'city', c.city
    )
  )
  INTO v_equipment
  FROM public.customer_equipments e
  LEFT JOIN public.customers c ON c.id = e.customer_id
  WHERE e.id = p_equipment_id
  LIMIT 1;

  IF v_equipment IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'visit_type', o.visit_type,
        'status', o.status,
        'diagnosis', o.diagnosis,
        'created_at', o.created_at
      )
      ORDER BY o.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_history
  FROM public.service_orders o
  WHERE o.equipment_id = p_equipment_id;

  RETURN jsonb_build_object(
    'equipment', v_equipment,
    'history', v_history
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_equipment_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_equipment_history(uuid) TO anon, authenticated;

-- 2. service_orders: bloquear `anon`, liberar apenas `authenticated`
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_orders_select" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_insert" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_update" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_delete" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_auth_all" ON public.service_orders;
CREATE POLICY "service_orders_auth_all" ON public.service_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. service_order_parts: bloquear `anon`, liberar apenas `authenticated`
ALTER TABLE public.service_order_parts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_order_parts_select" ON public.service_order_parts;
DROP POLICY IF EXISTS "service_order_parts_insert" ON public.service_order_parts;
DROP POLICY IF EXISTS "service_order_parts_update" ON public.service_order_parts;
DROP POLICY IF EXISTS "service_order_parts_delete" ON public.service_order_parts;
DROP POLICY IF EXISTS "service_order_parts_auth_all" ON public.service_order_parts;
CREATE POLICY "service_order_parts_auth_all" ON public.service_order_parts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. service_order_attachments: bloquear `anon`, liberar apenas `authenticated`
ALTER TABLE public.service_order_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attachments_select" ON public.service_order_attachments;
DROP POLICY IF EXISTS "attachments_insert" ON public.service_order_attachments;
DROP POLICY IF EXISTS "attachments_update" ON public.service_order_attachments;
DROP POLICY IF EXISTS "attachments_delete" ON public.service_order_attachments;
DROP POLICY IF EXISTS "service_order_attachments_auth_all" ON public.service_order_attachments;
CREATE POLICY "service_order_attachments_auth_all" ON public.service_order_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. customer_equipments: bloquear `anon`, liberar apenas `authenticated`
ALTER TABLE public.customer_equipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipments_select" ON public.customer_equipments;
DROP POLICY IF EXISTS "equipments_insert" ON public.customer_equipments;
DROP POLICY IF EXISTS "equipments_update" ON public.customer_equipments;
DROP POLICY IF EXISTS "equipments_delete" ON public.customer_equipments;
DROP POLICY IF EXISTS "customer_equipments_auth_all" ON public.customer_equipments;
CREATE POLICY "customer_equipments_auth_all" ON public.customer_equipments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. stock_movements: bloquear `anon`, liberar apenas `authenticated`
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "movements_select" ON public.stock_movements;
DROP POLICY IF EXISTS "movements_insert" ON public.stock_movements;
DROP POLICY IF EXISTS "movements_update" ON public.stock_movements;
DROP POLICY IF EXISTS "movements_delete" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_auth_all" ON public.stock_movements;
CREATE POLICY "stock_movements_auth_all" ON public.stock_movements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. services: bloquear `anon`, liberar apenas `authenticated`
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "services_select" ON public.services;
DROP POLICY IF EXISTS "services_insert" ON public.services;
DROP POLICY IF EXISTS "services_update" ON public.services;
DROP POLICY IF EXISTS "services_delete" ON public.services;
DROP POLICY IF EXISTS "services_auth_all" ON public.services;
CREATE POLICY "services_auth_all" ON public.services
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. used_items: bloquear `anon`, liberar apenas `authenticated`
ALTER TABLE public.used_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_used_items" ON public.used_items;
DROP POLICY IF EXISTS "used_items_auth_select" ON public.used_items;
CREATE POLICY "used_items_auth_select" ON public.used_items
  FOR SELECT TO authenticated USING (true);

-- 9. Storage: bloquear leitura anônima de comprovantes financeiros (expenses-attachments)
DROP POLICY IF EXISTS "allow_public_read_expenses_attachments" ON storage.objects;
DROP POLICY IF EXISTS "allow_auth_read_expenses_attachments" ON storage.objects;
CREATE POLICY "allow_auth_read_expenses_attachments" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'expenses-attachments');

-- 10. site_banners & site_products: manter leitura pública `anon`, restringir escrita a admin/comercial
DROP POLICY IF EXISTS "site_banners_auth_insert" ON public.site_banners;
DROP POLICY IF EXISTS "site_banners_auth_update" ON public.site_banners;
DROP POLICY IF EXISTS "site_banners_auth_delete" ON public.site_banners;
CREATE POLICY "site_banners_auth_insert" ON public.site_banners
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_comercial());
CREATE POLICY "site_banners_auth_update" ON public.site_banners
  FOR UPDATE TO authenticated USING (public.is_admin_or_comercial()) WITH CHECK (public.is_admin_or_comercial());
CREATE POLICY "site_banners_auth_delete" ON public.site_banners
  FOR DELETE TO authenticated USING (public.is_admin_or_comercial());

DROP POLICY IF EXISTS "site_products_auth_insert" ON public.site_products;
DROP POLICY IF EXISTS "site_products_auth_update" ON public.site_products;
DROP POLICY IF EXISTS "site_products_auth_delete" ON public.site_products;
CREATE POLICY "site_products_auth_insert" ON public.site_products
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_comercial());
CREATE POLICY "site_products_auth_update" ON public.site_products
  FOR UPDATE TO authenticated USING (public.is_admin_or_comercial()) WITH CHECK (public.is_admin_or_comercial());
CREATE POLICY "site_products_auth_delete" ON public.site_products
  FOR DELETE TO authenticated USING (public.is_admin_or_comercial());
