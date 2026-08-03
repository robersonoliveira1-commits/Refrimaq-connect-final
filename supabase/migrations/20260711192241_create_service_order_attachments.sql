CREATE TABLE IF NOT EXISTS service_order_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE service_order_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_service_order_attachments" ON service_order_attachments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "insert_service_order_attachments" ON service_order_attachments FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "delete_service_order_attachments" ON service_order_attachments FOR DELETE
  TO authenticated USING (true);

INSERT INTO storage.buckets (id, name, public) VALUES ('service-order-attachments', 'service-order-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "allow_auth_upload_os_attachments" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'service-order-attachments');

CREATE POLICY "allow_public_read_os_attachments" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'service-order-attachments');

CREATE POLICY "allow_auth_delete_os_attachments" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'service-order-attachments');
