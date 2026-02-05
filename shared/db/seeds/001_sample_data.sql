-- Sample Seed Data for Development and Testing

-- ============================================================================
-- USERS
-- ============================================================================

-- Create test admin user
INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active, email_verified) VALUES
(
    uuid_generate_v4(),
    'admin@example.com',
    '$2a$10$ExampleHashedPasswordForAdmin123', -- Replace with actual bcrypt hash
    'Admin',
    'User',
    'admin',
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- Create test customer users
INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active, email_verified) VALUES
(
    uuid_generate_v4(),
    'customer@example.com',
    '$2a$10$ExampleHashedPasswordForCustomer', -- Replace with actual bcrypt hash
    'John',
    'Doe',
    'customer',
    true,
    true
),
(
    uuid_generate_v4(),
    'jane@example.com',
    '$2a$10$ExampleHashedPasswordForJane', -- Replace with actual bcrypt hash
    'Jane',
    'Smith',
    'customer',
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- PRODUCTS
-- ============================================================================

-- Create sample products
WITH product_data AS (
    SELECT
        unnest(array[
            'Basic Storage Plan',
            'Premium Storage Plan',
            'Enterprise Storage Plan',
            'Cloud Backup',
            'File Sync',
            'Team Collaboration'
        ]) as name,
        unnest(array[
            '50 GB of secure cloud storage',
            '500 GB of secure cloud storage with priority support',
            '2 TB of secure cloud storage with enterprise features',
            'Automatic backup for all your files',
            'Sync files across all your devices',
            'Collaborate with your team in real-time'
        ]) as description,
        unnest(array[
            'STORAGE-BASIC',
            'STORAGE-PREMIUM',
            'STORAGE-ENTERPRISE',
            'BACKUP-001',
            'SYNC-001',
            'TEAM-001'
        ]) as sku,
        unnest(array[4.99, 9.99, 29.99, 2.99, 1.99, 4.99]) as price,
        unnest(array[NULL, 7.99, 24.99, NULL, NULL, NULL]) as compare_at_price,
        unnest(array['storage', 'storage', 'storage', 'backup', 'sync', 'collaboration']) as category,
        unnest(array[true, true, true, false, false, false]) as is_digital
)
INSERT INTO products (name, description, sku, price, compare_at_price, category, is_digital, is_active)
SELECT name, description, sku, price, compare_at_price, category, is_digital, true
FROM product_data
ON CONFLICT (sku) DO NOTHING;

-- ============================================================================
-- INVENTORY
-- ============================================================================

-- Initialize inventory for products
-- For digital products, inventory is unlimited (set high number)
INSERT INTO inventory (product_id, available, reserved, on_hand, low_stock_threshold)
SELECT
    p.id,
    CASE WHEN p.is_digital THEN 10000 ELSE 100 END,
    0,
    CASE WHEN p.is_digital THEN 10000 ELSE 100 END,
    CASE WHEN p.is_digital THEN 1000 ELSE 10 END
FROM products p
WHERE NOT EXISTS (
    SELECT 1 FROM inventory i WHERE i.product_id = p.id
);

-- ============================================================================
-- ADDRESSES
-- ============================================================================

-- Add sample addresses for test users
INSERT INTO addresses (user_id, address_type, full_name, line1, line2, city, state, postal_code, country, phone, is_default)
SELECT
    u.id,
    'shipping',
    u.first_name || ' ' || u.last_name,
    '123 Main Street',
    'Apt 4B',
    'San Francisco',
    'CA',
    '94102',
    'USA',
    '+1-555-0100',
    true
FROM users u
WHERE u.email IN ('customer@example.com', 'jane@example.com')
AND NOT EXISTS (
    SELECT 1 FROM addresses a WHERE a.user_id = u.id
);

-- ============================================================================
-- INITIAL DATA SUMMARY
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Seed data created successfully';
    RAISE NOTICE 'Users: %', (SELECT COUNT(*) FROM users);
    RAISE NOTICE 'Products: %', (SELECT COUNT(*) FROM products);
    RAISE NOTICE 'Inventory records: %', (SELECT COUNT(*) FROM inventory);
    RAISE NOTICE 'Addresses: %', (SELECT COUNT(*) FROM addresses);
END $$;
