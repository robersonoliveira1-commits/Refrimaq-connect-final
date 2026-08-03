ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Allow admins to update any profile (for managing team)
CREATE POLICY "admin_update_all_profiles" ON user_profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (true);

-- Allow admins to insert profiles (when creating technicians)
CREATE POLICY "admin_insert_profiles" ON user_profiles FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to delete profiles
CREATE POLICY "admin_delete_profiles" ON user_profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Add route_stops status field (ok, absent, postponed)
ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ok', 'absent', 'postponed'));

-- Update existing visited=true stops to have status='ok'
UPDATE route_stops SET status = 'ok' WHERE visited = true AND status = 'pending';
