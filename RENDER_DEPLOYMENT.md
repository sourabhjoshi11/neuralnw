# 🚀 Deploy Backend to Render - Step by Step

## Prerequisites
- GitHub account
- Render account (free): https://render.com

---

## Step 1: Push Code to GitHub

```bash
cd backend
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

---

## Step 2: Create Render Account

1. Go to: https://render.com
2. Click **"Get Started"**
3. Sign up with GitHub
4. Authorize Render

---

## Step 3: Create PostgreSQL Database

1. Click **"New +"** → **"PostgreSQL"**
2. **Settings**:
   - Name: `classchaos-db`
   - Database: `classchaos`
   - User: `classchaos`
   - Region: **Singapore** (closest to India)
   - Plan: **Free** (or Starter $7/month for better performance)
3. Click **"Create Database"**
4. **Wait 2-3 minutes** for database to be ready
5. **Copy Internal Database URL** (starts with `postgresql://`)

---

## Step 4: Create Web Service

1. Click **"New +"** → **"Web Service"**
2. **Connect Repository**:
   - Click **"Connect account"** if needed
   - Select your repository
   - Click **"Connect"**
3. **Configure Service**:
   - Name: `classchaos-backend`
   - Region: **Singapore**
   - Branch: `main`
   - Root Directory: `backend`
   - Runtime: **Python 3**
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. **Plan**: Free (or Starter $7/month)

---

## Step 5: Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add these one by one:

```env
# Database (paste from Step 3)
DATABASE_URL=postgresql://classchaos:password@dpg-xxx.singapore-postgres.render.com/classchaos

# Security (generate random 32+ char string)
SECRET_KEY=your-super-secret-key-min-32-characters-long

# Environment
APP_ENV=production

# Supabase (get from https://supabase.com)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here

# CORS (your frontend domains)
CORS_ORIGINS=https://classchaos.app,https://www.classchaos.app
```

**Generate SECRET_KEY:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Step 6: Deploy

1. Click **"Create Web Service"**
2. **Wait 5-10 minutes** for first deploy
3. Watch logs for any errors
4. Once deployed, you'll see: **"Your service is live 🎉"**

---

## Step 7: Get Your API URL

Your backend will be available at:
```
https://classchaos-backend.onrender.com
```

Test it:
```
https://classchaos-backend.onrender.com/docs
```

You should see the FastAPI documentation page!

---

## Step 8: Update Frontend

Update `frontend/.env`:
```env
EXPO_PUBLIC_API_URL=https://classchaos-backend.onrender.com
EXPO_PUBLIC_WS_URL=wss://classchaos-backend.onrender.com
```

---

## Step 9: Custom Domain (Optional)

1. Buy domain: `classchaos.app`
2. In Render Dashboard → **Settings** → **Custom Domain**
3. Add: `api.classchaos.app`
4. Update DNS:
   ```
   Type    Name    Value
   CNAME   api     classchaos-backend.onrender.com
   ```
5. Wait for SSL certificate (automatic)

---

## Troubleshooting

### Build Fails
**Error**: `Could not find requirements.txt`
**Fix**: Set Root Directory to `backend`

### Database Connection Error
**Error**: `could not connect to server`
**Fix**: 
1. Check DATABASE_URL is correct
2. Use **Internal Database URL** (not External)
3. Ensure database is in same region

### Port Error
**Error**: `Address already in use`
**Fix**: Use `--port $PORT` in start command (already done)

### Import Errors
**Error**: `ModuleNotFoundError`
**Fix**: Add missing packages to `requirements.txt`

### CORS Error
**Error**: `blocked by CORS policy`
**Fix**: Add your frontend URL to CORS_ORIGINS

---

## Monitoring

### View Logs
Dashboard → Your Service → **Logs** tab

### Check Health
```bash
curl https://classchaos-backend.onrender.com/docs
```

### Database Stats
Dashboard → Database → **Metrics** tab

---

## Auto-Deploy

Render automatically deploys when you push to GitHub:

```bash
git add .
git commit -m "Update backend"
git push origin main
# Render auto-deploys in 2-3 minutes
```

---

## Upgrade to Paid Plan (Recommended)

**Free Plan Limitations:**
- Spins down after 15 mins of inactivity
- Cold start takes 30-60 seconds
- 750 hours/month free

**Starter Plan ($7/month):**
- Always on (no cold starts)
- Better performance
- More resources

**To Upgrade:**
Dashboard → Settings → **Plan** → Select Starter

---

## Cost Breakdown

| Service | Free | Paid |
|---------|------|------|
| Web Service | ✅ 750hrs | $7/month |
| PostgreSQL | ✅ 90 days | $7/month |
| SSL Certificate | ✅ Free | ✅ Free |
| Auto-deploy | ✅ Free | ✅ Free |

**Recommended**: Start free, upgrade when you have users.

---

## Next Steps

1. ✅ Backend deployed
2. ⏳ Deploy frontend to Vercel
3. ⏳ Build Android APK
4. ⏳ Submit to Play Store

**Your backend is live! 🎉**

API URL: `https://classchaos-backend.onrender.com`
