ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_product_id uuid REFERENCES products(id) DEFAULT NULL;
CREATE INDEX IF NOT EXISTS products_parent_product_id_idx ON products (parent_product_id);
