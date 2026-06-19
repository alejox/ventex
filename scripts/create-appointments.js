const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://omnnucpkdxbqzekzyopt.supabase.co',
  'sb_publishable_If3kphMbswLI1_-l3_DRMw_hEdUhdiP'
);

const sql = `
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  service_type text,
  appointment_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users own appointments' AND tablename = 'appointments'
  ) THEN
    CREATE POLICY "Users own appointments" ON appointments
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON appointments TO authenticated;

CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON appointments (user_id, appointment_date);
`;

async function run() {
  console.log('Executing SQL...');
  
  // Try via RPC first
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  
  if (error) {
    console.log('RPC exec_sql not available, trying query function...');
    
    // Try direct fetch to /rest/v1/
    const res = await fetch('https://omnnucpkdxbqzekzyopt.supabase.co/rest/v1/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'sb_publishable_If3kphMbswLI1_-l3_DRMw_hEdUhdiP',
        'Authorization': 'Bearer sb_publishable_If3kphMbswLI1_-l3_DRMw_hEdUhdiP',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ query: sql })
    });
    
    const txt = await res.text();
    console.log('Response:', res.status, txt.substring(0, 500));
  } else {
    console.log('Success:', data);
  }
  
  // Verify table exists
  console.log('\nVerifying table...');
  const { data: tables, error: e2 } = await supabase
    .from('pg_tables')
    .select('tablename')
    .eq('schemaname', 'public')
    .eq('tablename', 'appointments');
  
  if (e2) {
    // Try querying the table directly
    const { data: rows, error: e3 } = await supabase
      .from('appointments')
      .select('id')
      .limit(1);
    
    if (e3) {
      console.log('Table query error:', e3.message);
    } else {
      console.log('Table exists! Rows found:', rows.length);
    }
  } else {
    console.log('Table found in pg_tables:', tables);
  }
}

run().catch(e => console.error('Fatal:', e.message));
