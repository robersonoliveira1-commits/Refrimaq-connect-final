-- Migration: Criação da tabela customer_equipments e relacionamento em service_orders

CREATE TABLE IF NOT EXISTS customer_equipments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  equip_type   text NOT NULL DEFAULT '',
  equip_brand  text NOT NULL DEFAULT '',
  equip_model  text NOT NULL DEFAULT '',
  equip_serial text NOT NULL DEFAULT '',
  equip_gas    text NOT NULL DEFAULT '',
  equip_voltage text NOT NULL DEFAULT '',
  created_at   timestamptz DEFAULT now()
);

-- Habilitar RLS na tabela de equipamentos
ALTER TABLE customer_equipments ENABLE ROW LEVEL SECURITY;

-- Adicionar políticas de RLS
DROP POLICY IF EXISTS "equipments_select" ON customer_equipments;
CREATE POLICY "equipments_select" ON customer_equipments FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "equipments_insert" ON customer_equipments;
CREATE POLICY "equipments_insert" ON customer_equipments FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "equipments_update" ON customer_equipments;
CREATE POLICY "equipments_update" ON customer_equipments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "equipments_delete" ON customer_equipments;
CREATE POLICY "equipments_delete" ON customer_equipments FOR DELETE TO anon, authenticated USING (true);

-- Indexar para busca contra duplicidades por cliente + serial
CREATE INDEX IF NOT EXISTS idx_equipments_customer_serial ON customer_equipments(customer_id, equip_serial);

-- Adicionar coluna de relacionamento nas ordens de serviço
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES customer_equipments(id) ON DELETE SET NULL;

-- Backfill: Criar registros de equipamentos baseados nas OSs existentes
DO $$
DECLARE
  r RECORD;
  new_equip_id uuid;
BEGIN
  FOR r IN 
    SELECT 
      customer_id,
      TRIM(COALESCE(equip_type, '')) as equip_type,
      TRIM(COALESCE(equip_brand, '')) as equip_brand,
      TRIM(COALESCE(equip_model, '')) as equip_model,
      TRIM(COALESCE(equip_serial, '')) as equip_serial,
      TRIM(COALESCE(equip_gas, '')) as equip_gas,
      TRIM(COALESCE(equip_voltage, '')) as equip_voltage
    FROM service_orders
    WHERE COALESCE(equip_type, '') <> '' 
       OR COALESCE(equip_brand, '') <> '' 
       OR COALESCE(equip_model, '') <> '' 
       OR COALESCE(equip_serial, '') <> ''
    GROUP BY 
      customer_id, 
      TRIM(COALESCE(equip_type, '')), 
      TRIM(COALESCE(equip_brand, '')), 
      TRIM(COALESCE(equip_model, '')), 
      TRIM(COALESCE(equip_serial, '')), 
      TRIM(COALESCE(equip_gas, '')), 
      TRIM(COALESCE(equip_voltage, ''))
  LOOP
    -- Verificar se já existe
    SELECT id INTO new_equip_id 
    FROM customer_equipments 
    WHERE customer_id = r.customer_id 
      AND (
        (r.equip_serial <> '' AND equip_serial = r.equip_serial)
        OR (r.equip_serial = '' AND equip_brand = r.equip_brand AND equip_model = r.equip_model AND equip_type = r.equip_type)
      );

    IF new_equip_id IS NULL THEN
      -- Inserir novo equipamento
      INSERT INTO customer_equipments (customer_id, equip_type, equip_brand, equip_model, equip_serial, equip_gas, equip_voltage)
      VALUES (r.customer_id, r.equip_type, r.equip_brand, r.equip_model, r.equip_serial, r.equip_gas, r.equip_voltage)
      RETURNING id INTO new_equip_id;
    END IF;

    -- Atualizar as ordens de serviço correspondentes
    UPDATE service_orders
    SET equipment_id = new_equip_id
    WHERE customer_id = r.customer_id
      AND (
        (r.equip_serial <> '' AND TRIM(COALESCE(equip_serial, '')) = r.equip_serial)
        OR (r.equip_serial = '' AND TRIM(COALESCE(equip_brand, '')) = r.equip_brand AND TRIM(COALESCE(equip_model, '')) = r.equip_model AND TRIM(COALESCE(equip_type, '')) = r.equip_type)
      );
  END LOOP;
END $$;

