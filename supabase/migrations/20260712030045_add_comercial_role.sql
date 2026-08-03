-- Alter the role column to accept 'comercial' (currently may have a check constraint)
DO $$
BEGIN
  -- Add comercial to the check constraint if one exists
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%user_profiles%role%'
       OR constraint_name LIKE '%role%'
  ) THEN
    -- Drop and recreate the constraint
    ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
  END IF;
  
  ALTER TABLE user_profiles
    ADD CONSTRAINT user_profiles_role_check
    CHECK (role IN ('admin', 'technician', 'comercial'));
END $$;
