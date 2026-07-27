-- Elimina la sobrecarga vieja de create_sale (sin p_payments)
-- que causaba ambigüedad con la nueva versión del split payments.
drop function if exists public.create_sale(uuid, text, numeric, jsonb, uuid, text, text);
