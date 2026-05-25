# ✅ Render Deployment Checklist

## Before You Start
- [ ] Code pushed to GitHub
- [ ] Render account created
- [ ] Supabase account created (for file storage)

## Step-by-Step

### 1. Create Database (5 mins)
- [ ] Go to Render.com
- [ ] New + → PostgreSQL
- [ ] Name: `classchaos-db`
- [ ] Region: Singapore
- [ ] Plan: Free
- [ ] Copy Internal Database URL

### 2. Create Web Service (10 mins)
- [ ] New + → Web Service
- [ ] Connect GitHub repository
- [ ] Root Directory: `backend`
- [ ] Build: `pip install -r requirements.txt`
- [ ] Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- [ ] Region: Singapore
- [ ] Plan: Free

### 3. Environment Variables
- [ ] DATABASE_URL (from step 1)
- [ ] SECRET_KEY (generate random 32+ chars)
- [ ] APP_ENV=production
- [ ] SUPABASE_URL
- [ ] SUPABASE_SERVICE_KEY
- [ ] CORS_ORIGINS

### 4. Deploy & Test
- [ ] Click "Create Web Service"
- [ ] Wait for deployment (5-10 mins)
- [ ] Test: https://your-app.onrender.com/docs
- [ ] Check logs for errors

### 5. Update Frontend
- [ ] Update EXPO_PUBLIC_API_URL in frontend/.env
- [ ] Update EXPO_PUBLIC_WS_URL in frontend/.env
- [ ] Test connection from app

## Your URLs

Backend API:
```
https://classchaos-backend.onrender.com
```

API Docs:
```
https://classchaos-backend.onrender.com/docs
```

## Quick Commands

Generate SECRET_KEY:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Test API:
```bash
curl https://classchaos-backend.onrender.com/docs
```

Push updates:
```bash
git add .
git commit -m "Update"
git push origin main
# Auto-deploys in 2-3 mins
```

## Need Help?

See full guide: `RENDER_DEPLOYMENT.md`

**Estimated Time: 20 minutes** ⏱️
