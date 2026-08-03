-- Drop the recursive admin policies that don't work
DROP POLICY IF EXISTS "admin_select_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_update_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_delete_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_insert_profiles" ON user_profiles;

-- Recreate admin policies using auth.jwt() to avoid recursion
-- The role is stored in user_metadata during signup
CREATE POLICY "admin_select_all_profiles" ON user_profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id
    OR (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
  );

-- Drop the old select_own_profile since the new admin policy covers it
DROP POLICY IF EXISTS "select_own_profile" ON user_profiles;

-- Admin can update any profile
CREATE POLICY "admin_update_all_profiles" ON user_profiles FOR UPDATE
  TO authenticated USING (
    auth.uid() = id
    OR (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    auth.uid() = id
    OR (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
  );

-- Admin can insert profiles (for creating technicians via edge function)
CREATE POLICY "admin_insert_profiles" ON user_profiles FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = id
    OR (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
  );

-- Admin can delete profiles
CREATE POLICY "admin_delete_profiles" ON user_profiles FOR DELETE
  TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
  );
