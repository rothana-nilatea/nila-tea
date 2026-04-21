require('dotenv').config();
const https = require('https');
const { pool } = require('./db');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const KHR_RATE = 4100;

// Store name mapping from Telegram group names
const STORE_MAP = {
  'atm': ['atm', 'អង្គតាមីញ', 'angtamin', 'nila atm'],
  'hru': ['hru', 'សាលាធនធាន', 'human resource', 'nila hru']
};

function detectStore(text, chatTitle) {
  const combined = ((text || '') + ' ' + (chatTitle || '')).toLowerCase();
  for (const [storeId, keywords] of Object.entries(STORE_MAP)) {
    if (keywords.some(kw => combined.includes(kw.toLowerCase()))) {
      return storeId;
    }
  }
  return null;
}

function parseAmount(text) {
  if (!text) return null;

  // Match USD: $1.00 or $1,000.00
  const usdMatch = text.match(/\$([0-9,]+\.?[0-9]*)/);
  if (usdMatch) {
    const amount = parseFloat(usdMatch[1].replace(',', ''));
    return { amount, currency: 'USD', amountUsd: amount };
  }

  // Match KHR: ៛3,500 or ₫3,500
  const khrMatch = text.match(/[៛₫฿]([0-9,]+)/);
  if (khrMatch) {
    const amount = parseFloat(khrMatch[1].replace(/,/g, ''));
    return { amount, currency: 'KHR', amountUsd: amount / KHR_RATE };
  }

  // Match plain number with "paid" context
  const paidMatch = text.match(/([0-9,]+(?:\.[0-9]+)?)\s*(?:USD|KHR|usd|khr)/i);
  if (paidMatch) {
    const amount = parseFloat(paidMatch[1].replace(',', ''));
    const currency = paidMatch[2].toUpperCase();
    return { amount, currency, amountUsd: currency === 'KHR' ? amount / KHR_RATE : amount };
  }

  return null;
}

function parsePayer(text) {
  // "paid by NAME (*123)"
  const match = text.match(/paid by ([^(]+)\s*\(\s*\*?\d+/i);
  if (match) return match[1].trim();
  return 'Unknown';
}

function parseTrxId(text) {
  const match = text.match(/Trx\.?\s*ID[:\s]+(\d+)/i);
  return match ? match[1] : null;
}

async function processPayment(message, chatTitle) {
  const text = message.text || message.caption || '';
  
  // Only process PayWay/ABA payment messages
  const isPayment = text.includes('paid by') || text.includes('PayWay') || text.includes('ABA KHQR');
  if (!isPayment) return;

  const parsed = parseAmount(text);
  if (!parsed) return;

  const storeId = detectStore(text, chatTitle);
  if (!storeId) {
    console.log('Could not detect store from:', chatTitle);
    return;
  }

  const payer = parsePayer(text);
  const trxId = parseTrxId(text);
  const ref = trxId || `TG-${Date.now()}`;

  console.log(`💰 Payment detected: ${parsed.currency} ${parsed.amount} (${parsed.amountUsd.toFixed(2)} USD) at ${storeId} from ${payer}`);

  try {
    await pool.query(
      `INSERT INTO aba_transactions (store_id, ref, amount_usd, from_account, txn_time)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (ref) DO NOTHING`,
      [storeId, ref, parsed.amountUsd.toFixed(4), payer]
    );
    console.log(`✅ Saved to DB: ${ref}`);
  } catch (e) {
    console.error('DB error:', e.message);
  }
}

// Telegram long polling
let offset = 0;

async function getUpdates() {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30&allowed_updates=["message","channel_post"]`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function setPrivacy() {
  // Allow bot to read all messages in groups
  return new Promise((resolve) => {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getMe`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          console.log(`🤖 Bot: @${info.result?.username}`);
        } catch (e) {}
        resolve();
      });
    }).on('error', resolve);
  });
}

async function poll() {
  console.log('🤖 NilaTea ABA Bot starting...');
  await setPrivacy();

  while (true) {
    try {
      const data = await getUpdates();
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          const message = update.message || update.channel_post;
          if (message) {
            const chatTitle = message.chat?.title || message.chat?.username || '';
            await processPayment(message, chatTitle);
          }
        }
      }
    } catch (e) {
      console.error('Poll error:', e.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

poll();

// Keep Render happy by listening on a port
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('🤖 NilaTea ABA Bot is running');
}).listen(PORT, () => console.log(`🌐 Health check on port ${PORT}`));
