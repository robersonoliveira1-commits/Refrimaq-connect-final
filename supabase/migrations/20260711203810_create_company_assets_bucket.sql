-- Create company-assets storage bucket for logo uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-assets',
  'company-assets',
  true,
  2097152,
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users to manage objects in company-assets
CREATE POLICY "company_assets_select" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'company-assets');

CREATE POLICY "company_assets_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'company-assets');

CREATE POLICY "company_assets_update" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'company-assets');

CREATE POLICY "company_assets_delete" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'company-assets');

-- Allow public (anon) to read so logos load in PDFs and previews
CREATE POLICY "company_assets_public_select" ON storage.objects FOR SELECT
  TO anon USING (bucket_id = 'company-assets');
