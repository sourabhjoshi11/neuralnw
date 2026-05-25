# 🚨 Render Manual Setup (Python 3.11)

## Issue
Render is using Python 3.14 which is too new. We need Python 3.11.

## Solution: Manual Setup (Not Blueprint)

### Step 1: Create Web Service Manually

1. Go to https://render.com/dashboard
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo: `sourabhjoshi11/neuralnw`

### Step 2: Configure Service

```
Name: classchaos-backend
Region: Singapore
Branch: main
Root Directory: backend

Runtime: Python 3
Python Version: 3.11.9  ← IMPORTANT!

Build Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT

Instance Type: Free
```

### Step 3: Environment Variables

Click **"Advanced"** → Add these:

```env
APP_ENV=production

SECRET_KEY=791d1bd3c21f2acfb70e9e08fca33cd06f3aa5ebf48aeb208c06b3174610c482

DATABASE_URL=postgresql+asyncpg://postgres.gipmtahyameimrwurbdn:%40Sourabhjoshi9955@aws-1-ap-south-1.pooler.supabase.com:5432/postgres

SUPABASE_URL=https://gipmtahyameimrwurbdn.supabase.co

SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpcG10YWh5YW1laW1yd3VyYmRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODE2Mzc1OCwiZXhwIjoyMDkzNzM5NzU4fQ.CiH7kvTJKSTQ6zgmyzM_Q0PduNP4gDS2m35oz4MC0AQ

ENCRYPTION_KEY=jte2SWmFyYR1eM5DzaiaQrLJ44beLg4JOIYwSO0D9gM=

ALLOWED_ORIGINS=https://classchaos.app,https://www.classchaos.app

ALGORITHM=HS256

ACCESS_TOKEN_EXPIRE_MINUTES=43200
```

### Step 4: Create Service

Click **"Create Web Service"**

Wait 3-5 minutes for deployment.

### Step 5: Test

Your API will be at:
```
https://classchaos-backend.onrender.com/docs
```

---

## ⚠️ Critical: Python Version

**Make sure to select Python 3.11.9** in the dropdown!

If you see Python 3.14, the build will fail.

---

## Alternative: Use Railway Instead

Railway is easier and auto-detects Python version:

1. Go to https://railway.app
2. New Project → Deploy from GitHub
3. Select `sourabhjoshi11/neuralnw`
4. Root Directory: `backend`
5. Add environment variables
6. Deploy!

Railway auto-detects from `runtime.txt` ✅

---

## Quick Fix If Already Created

If you already created the service:

1. Go to service Settings
2. Find "Python Version"
3. Change to **3.11.9**
4. Click "Manual Deploy" → "Deploy latest commit"
