-- Allow all authenticated users to view user profiles (so team module works for everyone)
DROP POLICY IF EXISTS "select_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_select_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "select_own_profile" ON user_profiles;

CREATE POLICY "select_profiles_all" ON user_profiles FOR SELECT
  TO authenticated USING (true);
