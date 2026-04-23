require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'nila-tea-secret-2024';
const KHR_RATE = 4100;

// Cambodia is UTC+7 - get today's date in Cambodia time
function cambodiaDate() {
  const now = new Date();
  const cambodia = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  return cambodia.toISOString().split('T')[0];
}

app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.options('*', cors());
app.use(express.json({ limit: '15mb' }));

// ── HEALTH ──
app.get('/', (req, res) => res.json({
  status: '🍵 Nila Tea API running',
  stores: ['ATM', 'HRU'],
  time: new Date()
}));

// ── AUTH MIDDLEWARE ──
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}
function ownerOnly(req, res, next) {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Super admin only' });
  next();
}
function adminOrOwner(req, res, next) {
  if (req.user.role !== 'owner' && req.user.role !== 'manager') return res.status(403).json({ error: 'Admin access required' });
  next();
}
function storeAccess(req, res, next) {
  const storeId = req.params.storeId || req.body.store_id || req.query.store_id;
  if (req.user.role === 'owner') return next();
  if (req.user.store_id !== storeId) return res.status(403).json({ error: 'No access to this store' });
  next();
}

// ── LOGIN ──
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // Get store info if staff
    let storeInfo = null;
    if (user.store_id) {
      const { rows: sr } = await pool.query('SELECT * FROM stores WHERE id=$1', [user.store_id]);
      storeInfo = sr[0] || null;
    }

    const payload = {
      id: user.id, name: user.name, username: user.username,
      role: user.role, store_id: user.store_id,
      perms: {
        revenue: user.perm_revenue, menu: user.perm_menu,
        inv: user.perm_inv, users: user.perm_users,
        sales: user.perm_sales, endstock: user.perm_endstock
      }
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { ...payload, store: storeInfo } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STORES ──
app.get('/api/stores', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM stores WHERE active=true ORDER BY id');
  res.json(rows);
});

// ── USERS ──
app.get('/api/users', auth, adminOrOwner, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id,u.name,u.username,u.role,u.store_id,
           u.perm_revenue,u.perm_menu,u.perm_inv,u.perm_users,u.perm_sales,u.perm_endstock,
           s.name as store_name, s.short as store_short, s.color as store_color
    FROM users u LEFT JOIN stores s ON u.store_id=s.id ORDER BY u.id`);
  res.json(rows.map(u => ({
    ...u,
    perms: { revenue:u.perm_revenue, menu:u.perm_menu, inv:u.perm_inv, users:u.perm_users, sales:u.perm_sales, endstock:u.perm_endstock }
  })));
});

app.post('/api/users', auth, ownerOnly, async (req, res) => {
  try {
    const { name, username, password, role, store_id, perms } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const isOwner = role === 'owner' || role === 'manager';
    const p = perms || {};
    await pool.query(
      `INSERT INTO users (name,username,password_hash,role,store_id,perm_revenue,perm_menu,perm_inv,perm_users,perm_sales,perm_endstock)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [name, username, hash, role, store_id||null,
       isOwner||!!p.revenue, isOwner||!!p.menu, true, isOwner||!!p.users, true, true]
    );
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/users/:id', auth, ownerOnly, async (req, res) => {
  try {
    const { name, username, password, role, store_id, perms } = req.body;
    const p = perms || {};
    const isOwner = role === 'owner' || role === 'manager';
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `UPDATE users SET name=$1,username=$2,password_hash=$3,role=$4,store_id=$5,
         perm_revenue=$6,perm_menu=$7,perm_inv=$8,perm_users=$9,perm_sales=$10,perm_endstock=$11 WHERE id=$12`,
        [name,username,hash,role,store_id||null,isOwner||!!p.revenue,isOwner||!!p.menu,true,isOwner||!!p.users,true,true,req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE users SET name=$1,username=$2,role=$3,store_id=$4,
         perm_revenue=$5,perm_menu=$6,perm_inv=$7,perm_users=$8,perm_sales=$9,perm_endstock=$10 WHERE id=$11`,
        [name,username,role,store_id||null,isOwner||!!p.revenue,isOwner||!!p.menu,true,isOwner||!!p.users,true,true,req.params.id]
      );
    }
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/users/:id', auth, ownerOnly, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ── MENU ──
app.get('/api/stores/:storeId/menu', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM menu_items WHERE store_id=$1 AND active=true ORDER BY id',
    [req.params.storeId]
  );
  res.json(rows);
});

app.post('/api/stores/:storeId/menu', auth, async (req, res) => {
  try {
    const { name, category, price_usd, image_url } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO menu_items (store_id,name,category,price_usd,image_url) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.storeId, name, category, price_usd, image_url||null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/menu/:id', auth, async (req, res) => {
  const { name, category, price_usd, image_url } = req.body;
  await pool.query(
    'UPDATE menu_items SET name=$1,category=$2,price_usd=$3,image_url=$4 WHERE id=$5',
    [name, category, price_usd, image_url||null, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/menu/:id', auth, async (req, res) => {
  await pool.query('UPDATE menu_items SET active=false WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ── INVENTORY ──
app.get('/api/stores/:storeId/inventory', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM inventory WHERE store_id=$1 ORDER BY id',
    [req.params.storeId]
  );
  res.json(rows);
});

app.post('/api/stores/:storeId/inventory', auth, async (req, res) => {
  const { name, quantity, unit, status, count_daily, image_url } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO inventory (store_id,name,quantity,unit,status,count_daily,image_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [req.params.storeId, name, quantity, unit, status||'ok', count_daily!==false, image_url||null]
  );
  res.json(rows[0]);
});

app.put('/api/inventory/:id', auth, async (req, res) => {
  const { name, quantity, unit, status, count_daily, image_url } = req.body;
  await pool.query(
    'UPDATE inventory SET name=$1,quantity=$2,unit=$3,status=$4,count_daily=$5,image_url=$6,updated_at=NOW() WHERE id=$7',
    [name, quantity, unit, status, count_daily!==false, image_url||null, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/inventory/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM inventory WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/stores/:storeId/inventory/endstock', auth, async (req, res) => {
  try {
    const { items, submitted_by } = req.body;
    for (const item of items) {
      await pool.query(
        'UPDATE inventory SET quantity=$1,status=$2,updated_at=NOW() WHERE id=$3',
        [item.quantity, item.status, item.id]
      );
    }
    await pool.query(
      'INSERT INTO stock_submissions (store_id,submitted_by) VALUES ($1,$2)',
      [req.params.storeId, submitted_by]
    );
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── SALES ──
app.get('/api/stores/:storeId/sales', auth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const { rows } = await pool.query(
    'SELECT * FROM sales WHERE store_id=$1 AND sale_date=$2 ORDER BY created_at DESC',
    [req.params.storeId, date]
  );
  res.json(rows);
});

app.post('/api/stores/:storeId/sales', auth, async (req, res) => {
  try {
    const { amount_usd, payment_method, note, recorded_by } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO sales (store_id,amount_usd,payment_method,note,recorded_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.storeId, amount_usd, payment_method, note||null, recorded_by]
    );
    res.json(rows[0]);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── ABA WEBHOOK (receives ABA payment notifications) ──
app.post('/api/aba/webhook', async (req, res) => {
  try {
    const { store_id, ref, amount, from_account, txn_time } = req.body;
    const amountUsd = parseFloat(amount) / KHR_RATE;
    await pool.query(
      `INSERT INTO aba_transactions (store_id,ref,amount_usd,from_account,txn_time)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (ref) DO NOTHING`,
      [store_id, ref, amountUsd, from_account, txn_time || new Date()]
    );
    res.json({ received: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/stores/:storeId/aba', auth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const { rows } = await pool.query(
    `SELECT * FROM aba_transactions WHERE store_id=$1 AND DATE(txn_time)=$2 ORDER BY txn_time DESC`,
    [req.params.storeId, date]
  );
  res.json(rows);
});

// ── CLOSING REPORT ──
app.post('/api/stores/:storeId/close', auth, async (req, res) => {
  try {
    const storeId = req.params.storeId;
    const date = cambodiaDate();
    const { cash_total, cash_usd, cash_khr, aba_total, submitted_by } = req.body;

    // Use submitted amounts from frontend (staff counted cash physically)
    // Fall back to querying DB only if not provided
    let cashTotal = parseFloat(cash_total) || 0;
    let abaTotal = parseFloat(aba_total) || 0;

    // If not provided by frontend, query from DB
    if (!cash_total) {
      const { rows: cashRows } = await pool.query(
        `SELECT COALESCE(SUM(amount_usd),0) as total FROM sales WHERE store_id=$1 AND sale_date=$2 AND payment_method='cash'`,
        [storeId, date]
      );
      cashTotal = parseFloat(cashRows[0].total);
    }
    if (!aba_total) {
      const { rows: abaRows } = await pool.query(
        `SELECT COALESCE(SUM(amount_usd),0) as total FROM aba_transactions WHERE store_id=$1 AND DATE(txn_time)=$2`,
        [storeId, date]
      );
      abaTotal = parseFloat(abaRows[0].total);
    }

    const grandTotal = cashTotal + abaTotal;

    // Delete any existing record for today first, then insert fresh
    await pool.query(
      `DELETE FROM closing_reports WHERE store_id=$1 AND report_date=$2`,
      [storeId, date]
    );

    await pool.query(
      `INSERT INTO closing_reports (store_id,report_date,cash_total,aba_total,grand_total,submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [storeId, date, cashTotal, abaTotal, grandTotal, submitted_by]
    );

    res.json({ cash_total: cashTotal, aba_total: abaTotal, grand_total: grandTotal, khr_total: Math.round(grandTotal * KHR_RATE) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REVENUE / STATS ──
app.get('/api/stores/:storeId/revenue/today', auth, async (req, res) => {
  try {
    const storeId = req.params.storeId;
    const today = cambodiaDate();
    const { rows: salesRows } = await pool.query(
      `SELECT COALESCE(SUM(amount_usd),0) as cash_total, COUNT(*) as sale_count
       FROM sales WHERE store_id=$1 AND sale_date=$2 AND payment_method='cash'`,
      [storeId, today]
    );
    const { rows: abaRows } = await pool.query(
      `SELECT COALESCE(SUM(amount_usd),0) as aba_total, COUNT(*) as txn_count
       FROM aba_transactions WHERE store_id=$1 AND DATE(txn_time AT TIME ZONE 'Asia/Phnom_Penh')=$2`,
      [storeId, today]
    );
    // Also check closing_reports for today (staff close day submission)
    const { rows: closeRows } = await pool.query(
      `SELECT cash_total, aba_total, grand_total, submitted_by, created_at
       FROM closing_reports WHERE store_id=$1 AND report_date=$2
       ORDER BY created_at DESC LIMIT 1`,
      [storeId, today]
    );

    let cash = parseFloat(salesRows[0].cash_total);
    let aba = parseFloat(abaRows[0].aba_total);

    // If closing report exists and has more revenue, use it
    const closeReport = closeRows[0];
    if (closeReport) {
      const closeCash = parseFloat(closeReport.cash_total);
      const closeAba = parseFloat(closeReport.aba_total);
      // Use whichever is higher (closing report is the authoritative source)
      if (closeCash > cash) cash = closeCash;
      if (closeAba > aba) aba = closeAba;
    }

    const total = cash + aba;
    res.json({
      cash_total: cash, aba_total: aba, grand_total: total,
      khr_total: Math.round(total * KHR_RATE),
      sale_count: parseInt(salesRows[0].sale_count),
      txn_count: parseInt(abaRows[0].txn_count),
      close_report: closeReport ? {
        submitted_by: closeReport.submitted_by,
        submitted_at: closeReport.created_at
      } : null
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/revenue/all-stores', auth, adminOrOwner, async (req, res) => {
  try {
    const stores = ['atm', 'hru'];
    const result = {};
    for (const s of stores) {
      const today = cambodiaDate();
      const { rows: c } = await pool.query(
        `SELECT COALESCE(SUM(amount_usd),0) as t FROM sales WHERE store_id=$1 AND sale_date=$2`, [s, today]
      );
      const { rows: a } = await pool.query(
        `SELECT COALESCE(SUM(amount_usd),0) as t FROM aba_transactions WHERE store_id=$1 AND DATE(txn_time AT TIME ZONE 'Asia/Phnom_Penh')=$2`, [s, today]
      );
      const { rows: cr } = await pool.query(
        `SELECT cash_total, aba_total FROM closing_reports WHERE store_id=$1 AND report_date=$2 ORDER BY created_at DESC LIMIT 1`, [s, today]
      );
      let cash = parseFloat(c[0].t), aba = parseFloat(a[0].t);
      if (cr[0]) {
        if (parseFloat(cr[0].cash_total) > cash) cash = parseFloat(cr[0].cash_total);
        if (parseFloat(cr[0].aba_total) > aba) aba = parseFloat(cr[0].aba_total);
      }
      result[s] = { cash, aba, total: cash + aba };
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stores/:storeId/revenue/week', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DATE(created_at) as date,
              SUM(CASE WHEN payment_method='cash' THEN amount_usd ELSE 0 END) as cash,
              SUM(amount_usd) as total
       FROM sales WHERE store_id=$1 AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at) ORDER BY date`,
      [req.params.storeId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── DELETE CLOSING REPORT (admin only) ──
app.delete('/api/stores/:storeId/close', auth, ownerOnly, async (req, res) => {
  try {
    const today = cambodiaDate();
    await pool.query(
      `DELETE FROM closing_reports WHERE store_id=$1 AND report_date=$2`,
      [req.params.storeId, today]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


app.get('/api/closing-reports', auth, adminOrOwner, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const { rows } = await pool.query(
      `SELECT cr.store_id, cr.report_date, cr.cash_total, cr.aba_total, 
              cr.grand_total, cr.submitted_by, cr.created_at,
              s.name as store_name, s.short as store_short, s.color as store_color
       FROM closing_reports cr
       JOIN stores s ON cr.store_id = s.id
       WHERE cr.report_date >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
       ORDER BY cr.report_date DESC, cr.store_id`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── START ──
initDB().then(() => {
  app.listen(PORT, () => console.log(`🍵 Nila Tea API on port ${PORT}`));
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });

// ── LOGO ──
app.get('/api/logo', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key='logo' LIMIT 1`);
    res.json({ logo: rows.length && rows[0].value ? rows[0].value : null });
  } catch (e) { res.json({ logo: null }); }
});

app.post('/api/logo', auth, ownerOnly, async (req, res) => {
  try {
    const { logo } = req.body;
    if (!logo) return res.status(400).json({ error: 'No logo data' });
    if (logo.length > 2800000) return res.status(400).json({ error: 'Image too large. Max 2MB.' });
    await pool.query(
      `INSERT INTO app_settings (key,value) VALUES ('logo',$1) ON CONFLICT (key) DO UPDATE SET value=$1,updated_at=NOW()`,
      [logo]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MAIN WAREHOUSE ──
app.get('/api/warehouse', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM warehouse_stock ORDER BY name`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/warehouse', auth, ownerOnly, async (req, res) => {
  try {
    const { name, quantity, unit } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO warehouse_stock (name, quantity, unit)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET quantity = warehouse_stock.quantity + $2
       RETURNING *`,
      [name, quantity, unit]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Transfer from warehouse to store
app.post('/api/warehouse/transfer', auth, ownerOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { item_name, store_id, quantity } = req.body;

    // Check warehouse has enough
    const { rows: wRows } = await client.query(
      `SELECT * FROM warehouse_stock WHERE name=$1`, [item_name]
    );
    if (!wRows.length) throw new Error('Item not found in warehouse');
    if (parseFloat(wRows[0].quantity) < parseFloat(quantity)) {
      throw new Error(`Not enough stock. Available: ${wRows[0].quantity} ${wRows[0].unit}`);
    }

    // Reduce from warehouse
    await client.query(
      `UPDATE warehouse_stock SET quantity = quantity - $1, updated_at = NOW() WHERE name = $2`,
      [quantity, item_name]
    );

    // Add to store inventory
    await client.query(
      `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
       WHERE store_id = $2 AND name = $3`,
      [quantity, store_id, item_name]
    );

    // Log transfer
    await client.query(
      `INSERT INTO stock_transfers (item_name, from_location, to_store_id, quantity, transferred_by)
       VALUES ($1, 'warehouse', $2, $3, $4)`,
      [item_name, store_id, quantity, req.user.username]
    );

    await client.query('COMMIT');

    // Return updated warehouse
    const { rows } = await client.query(`SELECT * FROM warehouse_stock ORDER BY name`);
    res.json({ success: true, warehouse: rows });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

app.get('/api/warehouse/transfers', auth, ownerOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM stock_transfers ORDER BY transferred_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REVENUE BY DATE RANGE ──
app.get('/api/stores/:storeId/revenue/range', auth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const storeId = req.params.storeId;
    const { rows } = await pool.query(
      `SELECT 
        DATE(created_at) as date,
        SUM(CASE WHEN payment_method='cash' THEN amount_usd ELSE 0 END) as cash,
        SUM(amount_usd) as total,
        COUNT(*) as count
       FROM sales 
       WHERE store_id=$1 AND DATE(created_at) BETWEEN $2 AND $3
       GROUP BY DATE(created_at) ORDER BY date`,
      [storeId, from, to]
    );
    const { rows: abaRows } = await pool.query(
      `SELECT 
        DATE(txn_time) as date,
        SUM(amount_usd) as aba_total,
        COUNT(*) as count
       FROM aba_transactions
       WHERE store_id=$1 AND DATE(txn_time) BETWEEN $2 AND $3
       GROUP BY DATE(txn_time) ORDER BY date`,
      [storeId, from, to]
    );
    res.json({ sales: rows, aba: abaRows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Monthly summary
app.get('/api/stores/:storeId/revenue/monthly', auth, async (req, res) => {
  try {
    const { year, month } = req.query;
    const storeId = req.params.storeId;
    const { rows } = await pool.query(
      `SELECT 
        SUM(CASE WHEN payment_method='cash' THEN amount_usd ELSE 0 END) as cash_total,
        SUM(amount_usd) as grand_total,
        COUNT(*) as sale_count,
        COUNT(DISTINCT DATE(created_at)) as active_days
       FROM sales 
       WHERE store_id=$1 
       AND EXTRACT(YEAR FROM created_at)=$2 
       AND EXTRACT(MONTH FROM created_at)=$3`,
      [storeId, year, month]
    );
    const { rows: abaRows } = await pool.query(
      `SELECT SUM(amount_usd) as aba_total, COUNT(*) as txn_count
       FROM aba_transactions
       WHERE store_id=$1 
       AND EXTRACT(YEAR FROM txn_time)=$2 
       AND EXTRACT(MONTH FROM txn_time)=$3`,
      [storeId, year, month]
    );
    const cash = parseFloat(rows[0]?.cash_total||0);
    const aba = parseFloat(abaRows[0]?.aba_total||0);
    res.json({
      cash_total: cash,
      aba_total: aba, 
      grand_total: cash + aba,
      khr_total: Math.round((cash+aba)*4100),
      sale_count: parseInt(rows[0]?.sale_count||0),
      active_days: parseInt(rows[0]?.active_days||0),
      txn_count: parseInt(abaRows[0]?.txn_count||0)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
