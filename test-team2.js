import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('user_profiles').select('id, full_name, email, phone, role, active, assigned_day_index, created_at');
  console.log("Error:", error);
  console.log("Data length:", data?.length);
}
run();
