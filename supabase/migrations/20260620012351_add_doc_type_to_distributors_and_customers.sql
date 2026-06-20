ALTER TABLE distributors ADD COLUMN doc_type text DEFAULT 'NIT';
ALTER TABLE customers ADD COLUMN doc_type text DEFAULT 'CC';
