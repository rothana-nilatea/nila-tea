const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id VARCHAR(10) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        short VARCHAR(10) NOT NULL,
        color VARCHAR(20) DEFAULT '#1A6B3C',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'staff',
        store_id VARCHAR(10) REFERENCES stores(id),
        perm_revenue BOOLEAN DEFAULT false,
        perm_menu BOOLEAN DEFAULT false,
        perm_inv BOOLEAN DEFAULT true,
        perm_users BOOLEAN DEFAULT false,
        perm_sales BOOLEAN DEFAULT true,
        perm_endstock BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(10) REFERENCES stores(id),
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50) DEFAULT 'Tea',
        price_usd DECIMAL(10,2) NOT NULL,
        image_url TEXT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(10) REFERENCES stores(id),
        name VARCHAR(100) NOT NULL,
        quantity DECIMAL(10,2) DEFAULT 0,
        unit VARCHAR(30) DEFAULT 'pcs',
        status VARCHAR(20) DEFAULT 'ok',
        count_daily BOOLEAN DEFAULT true,
        image_url TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(10) REFERENCES stores(id),
        amount_usd DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(20) DEFAULT 'cash',
        note TEXT,
        aba_ref VARCHAR(50),
        aba_matched BOOLEAN DEFAULT false,
        recorded_by VARCHAR(50),
        sale_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS aba_transactions (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(10) REFERENCES stores(id),
        ref VARCHAR(50) UNIQUE NOT NULL,
        amount_usd DECIMAL(10,2) NOT NULL,
        from_account VARCHAR(50),
        matched BOOLEAN DEFAULT false,
        sale_id INT REFERENCES sales(id),
        txn_time TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS stock_submissions (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(10) REFERENCES stores(id),
        submitted_by VARCHAR(50),
        submitted_at TIMESTAMP DEFAULT NOW(),
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS closing_reports (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(10) REFERENCES stores(id),
        report_date DATE DEFAULT CURRENT_DATE,
        cash_total DECIMAL(10,2) DEFAULT 0,
        aba_total DECIMAL(10,2) DEFAULT 0,
        grand_total DECIMAL(10,2) DEFAULT 0,
        submitted_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed stores
    const { rows: storeRows } = await client.query('SELECT COUNT(*) FROM stores');
    if (parseInt(storeRows[0].count) === 0) {
      await client.query(`
        INSERT INTO stores (id, name, short, color) VALUES
          ('atm', 'Angtamin Store', 'ATM', '#1A6B3C'),
          ('hru', 'Human Resource University Store', 'HRU', '#1A4A8A')
      `);

      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('1234', 10);

      await client.query(`
        INSERT INTO users (name, username, password_hash, role, store_id, perm_revenue, perm_menu, perm_inv, perm_users, perm_sales, perm_endstock) VALUES
          ('Nila (Owner)', 'admin', $1, 'owner', NULL, true, true, true, true, true, true),
          ('Srey Mom', 'sreymom', $1, 'staff', 'atm', false, false, true, false, true, true),
          ('Dara', 'dara', $1, 'staff', 'hru', false, false, true, false, true, true),
          ('Sokha', 'sokha', $1, 'staff', 'atm', false, false, true, false, true, true)
      `, [hash]);

      // Seed menu for both stores
      for (const storeId of ['atm', 'hru']) {
        await client.query(`
          INSERT INTO menu_items (store_id, name, category, price_usd) VALUES
            ($1, 'Milk Tea', 'Tea', 1.50),
            ($1, 'Taro Latte', 'Tea', 2.00),
            ($1, 'Brown Sugar Milk', 'Tea', 1.75),
            ($1, 'Matcha Latte', 'Coffee', 2.00),
            ($1, 'Americano', 'Coffee', 1.25),
            ($1, 'Cappuccino', 'Coffee', 1.50),
            ($1, 'Cheese Tea', 'Tea', 2.50),
            ($1, 'Lychee Tea', 'Tea', 1.75),
            ($1, 'Mango Smoothie', 'Smoothie', 2.25)
        `, [storeId]);

        await client.query(`
          INSERT INTO inventory (store_id, name, quantity, unit, status, count_daily) VALUES
            ($1, 'Milk (whole)', 12, 'liters', 'ok', true),
            ($1, 'Tea leaves', 800, 'grams', 'ok', true),
            ($1, 'Taro powder', 150, 'grams', 'low', true),
            ($1, 'Brown sugar syrup', 1.2, 'liters', 'ok', true),
            ($1, 'Coffee beans', 400, 'grams', 'ok', true),
            ($1, 'Matcha powder', 80, 'grams', 'low', true),
            ($1, 'Mango puree', 6, 'packs', 'ok', false),
            ($1, 'Lychee syrup', 900, 'ml', 'ok', false),
            ($1, 'Cream cheese', 5, 'packs', 'ok', false),
            ($1, 'Tapioca pearls', 2, 'kg', 'ok', false),
            ($1, 'Sugar syrup', 3, 'liters', 'ok', false),
            ($1, 'Cups & lids', 200, 'pcs', 'ok', false)
        `, [storeId]);
      }

      console.log('✅ Database seeded with ATM & HRU stores');
    }
    console.log('✅ Database ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
