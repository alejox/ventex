import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de staff (barberos / estilistas / empleados) ----
export interface StaffMember {
  id: string;
  full_name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  commission_rate: number;
  status: string;
  created_at: string;
}

export interface NewStaffInput {
  full_name: string;
  role: string;
  phone: string;
  email: string;
  commission_rate: string;
  status: string;
}

const SELECT = "id, full_name, role, phone, email, commission_rate, status, created_at";

export async function fetchStaff(): Promise<StaffMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("staff").select(SELECT).order("full_name");
  if (error) throw error;
  return (data ?? []) as StaffMember[];
}

export async function createStaff(input: NewStaffInput): Promise<StaffMember> {
  const supabase = createClient();
  // user_id lo asigna el trigger set_staff_user_id / DEFAULT auth.uid().
  const { data, error } = await supabase
    .from("staff")
    .insert({
      full_name: input.full_name,
      role: input.role || null,
      phone: input.phone || null,
      email: input.email || null,
      commission_rate: parseFloat(input.commission_rate) || 0,
      status: input.status,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as StaffMember;
}

export async function updateStaff(id: string, input: NewStaffInput): Promise<StaffMember> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff")
    .update({
      full_name: input.full_name,
      role: input.role || null,
      phone: input.phone || null,
      email: input.email || null,
      commission_rate: parseFloat(input.commission_rate) || 0,
      status: input.status,
    })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as StaffMember;
}
