-- Add free-form shipping address text to orders (required at API level)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_address_text TEXT NOT NULL DEFAULT '';

