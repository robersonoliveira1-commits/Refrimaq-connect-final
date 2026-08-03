-- Drop all existing policies on user_profiles
DROP POLICY IF EXISTS "admin_select_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_update_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_delete_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_insert_profiles" ON user_profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "update_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "select_own_profile" ON user_profiles;

-- Create a security definer function to check admin without RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- SELECT: own row always, all rows if admin
CREATE POLICY "select_profiles" ON user_profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id OR public.is_admin()
  );

-- INSERT: own row or admin
CREATE POLICY "insert_profiles" ON user_profiles FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = id OR public.is_admin()
  );

-- UPDATE: own row or admin
CREATE POLICY "update_profiles" ON user_profiles FOR UPDATE
  TO authenticated USING (
    auth.uid() = id OR public.is_admin()
  ) WITH CHECK (
    auth.uid() = id OR public.is_admin()
  );

-- DELETE: admin only
CREATE POLICY "delete_profiles" ON user_profiles FOR DELETE
  TO authenticated USING (
    public.is_admin()
  );
