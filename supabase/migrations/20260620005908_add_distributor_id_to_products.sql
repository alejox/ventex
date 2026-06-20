ALTER TABLE products ADD COLUMN IF NOT EXISTS distributor_id uuid REFERENCES distributors(id) DEFAULT NULL;
