# Nila Tea POS — Deploy to Render

## What's in this package

```
nila-tea-final/
  backend/         ← Node.js API (Express + PostgreSQL)
    server.js      ← All API routes
    db.js          ← Database schema + seed data
    package.json
    .env.example
  frontend/        ← PWA web app
    index.html     ← Complete app (single file)
    manifest.json  ← PWA config
    sw.js          ← Offline support
```

---

## Step 1 — Push to GitHub

```bash
cd nila-tea-final
git init
git add .
git commit -m "Nila Tea POS v1.0"
# Create repo on GitHub called "nila-tea-pos"
git remote add origin https://github.com/YOUR_USERNAME/nila-tea-pos.git
git push -u origin main
```

---

## Step 2 — Create PostgreSQL on Render (Free)

1. Go to https://dashboard.render.com
2. Click **+ New → PostgreSQL**
3. Name: `nila-tea-db`
4. Plan: **Free**
5. Click **Create Database**
6. Copy the **Internal Database URL** — looks like:
   `postgresql://nila_tea_user:PASSWORD@dpg-xxxxx/nila_tea`

---

## Step 3 — Deploy Backend (Starter $7/month — always on)

1. Click **+ New → Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Name**: `nila-tea-backend`
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Starter ($7/month)
4. Add Environment Variables:
   ```
   DATABASE_URL = (paste Internal Database URL from Step 2)
   JWT_SECRET   = nila-tea-secret-2024-change-this
   NODE_ENV     = production
   PORT         = 3001
   ```
5. Click **Create Web Service**
6. Wait ~3 minutes for first deploy
7. Copy your backend URL:
   `https://nila-tea-backend.onrender.com`

---

## Step 4 — Update Frontend with Backend URL

Open `frontend/index.html` and find line ~220:
```javascript
const API = 'https://YOUR-NILA-TEA-BACKEND.onrender.com';
```
Replace with your real backend URL:
```javascript
const API = 'https://nila-tea-backend.onrender.com';
```
Save, commit, push to GitHub.

---

## Step 5 — Deploy Frontend (Free Static Site)

1. Click **+ New → Static Site**
2. Connect your GitHub repo
3. Settings:
   - **Name**: `nila-tea-app`
   - **Root Directory**: `frontend`
   - **Build Command**: *(leave empty)*
   - **Publish Directory**: `.`
4. Click **Create Static Site**
5. Your app URL: `https://nila-tea-app.onrender.com`

---

## Step 6 — Install on iPhone

1. Open `https://nila-tea-app.onrender.com` in **Safari**
2. Tap the **Share** button (box with arrow)
3. Tap **"Add to Home Screen"**
4. Tap **"Add"**
5. Nila Tea appears on your home screen like a real app!

---

## ABA Webhook Setup

Configure your ABA Business account to send payment notifications to:
```
POST https://nila-tea-backend.onrender.com/api/aba/webhook
```

Payload format:
```json
{
  "store_id": "atm",
  "ref": "TXN-12345",
  "amount": "8200",
  "from_account": "0XX-XXX-123",
  "txn_time": "2024-01-20T09:30:00Z"
}
```
Note: amount is in KHR (divided by 4100 to get USD automatically)

---

## Default Login Accounts

| Username | Password | Role  | Store |
|----------|----------|-------|-------|
| admin    | 1234     | Owner | Both  |
| sreymom  | 1234     | Staff | ATM   |
| dara     | 1234     | Staff | HRU   |
| sokha    | 1234     | Staff | ATM   |

**Important:** Change all passwords after first login!
Go to Settings → Users → Edit each user.

---

## Total Cost

| Service         | Plan         | Cost       |
|----------------|--------------|------------|
| Backend API     | Starter      | $7/month   |
| PostgreSQL DB   | Free         | $0/month   |
| Frontend PWA    | Static Free  | $0/month   |
| **Total**       |              | **$7/month** |

≈ ៛28,700/month — cheap for a full multi-store POS!

---

## Support

If something breaks:
- Check Render logs: Dashboard → your service → Logs
- Database issues: Check DATABASE_URL env var is correct
- App not loading: Clear browser cache and re-open
