ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_url text DEFAULT '';

INSERT INTO storage.buckets (id, name, public) VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "allow_auth_upload_product_photos" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'product-photos');

CREATE POLICY "allow_public_read_product_photos" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'product-photos');

CREATE POLICY "allow_auth_delete_product_photos" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'product-photos');
