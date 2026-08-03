-- Add equipment identification fields to service_orders
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS equip_type        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_brand       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_model       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_serial      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_gas         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_voltage     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_accessories text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_condition   text NOT NULL DEFAULT '';
