-- Add comprovante_url to contacts table for photo proof
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS comprovante_url text DEFAULT '';

-- Create storage bucket for comprovantes (visit proofs)
INSERT INTO storage.buckets (id, name, public) VALUES ('comprovantes', 'comprovantes', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to comprovantes bucket
CREATE POLICY "allow_auth_upload_comprovantes" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'comprovantes');

-- Allow public read on comprovantes bucket
CREATE POLICY "allow_public_read_comprovantes" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'comprovantes');
