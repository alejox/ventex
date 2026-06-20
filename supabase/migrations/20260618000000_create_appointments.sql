-- Módulo de Citas/Agenda para Ventex
-- Ejecutar en: Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
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
-- Nota: la conexión con services/staff (columnas service_id, staff_id) se añade
-- en 20260620121000, después de crear esas tablas (20260620120000).

-- Habilitar RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Política: usuarios solo ven sus propias citas
CREATE POLICY "Users own appointments" ON appointments
  FOR ALL USING (auth.uid() = user_id);

-- Permitir acceso al rol authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON appointments TO authenticated;

-- user_id lo fija el trigger (anti-spoofing); el DEFAULT auth.uid() lo hace opcional en INSERT.
CREATE TRIGGER set_appointments_user_id
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- Índice para consultas por rango de fechas
CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON appointments (user_id, appointment_date);
