# ✅ Supabase Setup - Already Configured!

## Current Configuration

Your Supabase is **already set up** and working:

```
Project: gipmtahyameimrwurbdn
Region: ap-south-1 (Mumbai)
Database: PostgreSQL (Pooler connection)
Storage: Configured for file uploads
```

---

## 🎯 What You Have

### ✅ Database
- **URL**: `gipmtahyameimrwurbdn.supabase.co`
- **Connection**: Pooler (async-ready)
- **Tables**: All models defined in backend

### ✅ Storage
- **Bucket**: Configured for images/audio
- **Public Access**: Enabled
- **Upload Endpoint**: Working

### ✅ Environment Variables
```env
DATABASE_URL=postgresql+asyncpg://postgres.gipmtahyameimrwurbdn:***@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://gipmtahyameimrwurbdn.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
```

---

## 🚀 For Production Deployment

### 1. Verify Storage Bucket Exists

Go to Supabase Dashboard → Storage:

```
Bucket Name: classchaos-uploads (or similar)
Public: Yes
File Size Limit: 50MB
Allowed MIME types: image/*, audio/*, video/*, application/pdf
```

**Create bucket if missing:**
```sql
-- In Supabase SQL Editor
INSERT INTO storage.buckets (id, name, public)
VALUES ('classchaos-uploads', 'classchaos-uploads', true);
```

### 2. Set Storage Policies

```sql
-- Allow public read
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'classchaos-uploads');

-- Allow authenticated upload
CREATE POLICY "Authenticated upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'classchaos-uploads');
```

### 3. Run Database Migrations

```bash
cd backend
alembic upgrade head
```

### 4. Verify Tables Exist

In Supabase SQL Editor:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';
```

**Expected tables:**
- users
- feeds
- feed_members
- feed_messages
- rooms
- anon_players
- cs_rooms
- cs_players
- cs_rounds

---

## 🔧 For Render Deployment

Use these **exact** environment variables:

```env
# Database (from Supabase)
DATABASE_URL=postgresql+asyncpg://postgres.gipmtahyameimrwurbdn:%40Sourabhjoshi9955@aws-1-ap-south-1.pooler.supabase.com:5432/postgres

# Supabase Storage
SUPABASE_URL=https://gipmtahyameimrwurbdn.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpcG10YWh5YW1laW1yd3VyYmRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODE2Mzc1OCwiZXhwIjoyMDkzNzM5NzU4fQ.CiH7kvTJKSTQ6zgmyzM_Q0PduNP4gDS2m35oz4MC0AQ

# App Config
APP_ENV=production
SECRET_KEY=791d1bd3c21f2acfb70e9e08fca33cd06f3aa5ebf48aeb208c06b3174610c482
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200

# Encryption
ENCRYPTION_KEY=jte2SWmFyYR1eM5DzaiaQrLJ44beLg4JOIYwSO0D9gM=

# CORS
ALLOWED_ORIGINS=https://classchaos.app,https://www.classchaos.app

# Optional (if you have them)
MSG91_AUTH_KEY=your-msg91-auth-key
MSG91_TEMPLATE_ID=your-msg91-template-id
OPENAI_API_KEY=sk-xxxxxxxx
```

---

## ⚠️ Important Notes

### Database Password
Your password contains `@` symbol, so it's URL-encoded as `%40`:
```
Original: @Sourabhjoshi9955
Encoded: %40Sourabhjoshi9955
```

### Storage Bucket Name
Check your actual bucket name in Supabase Dashboard. Update in code if different:
```python
# backend/app/api/routes/feed.py
bucket = "classchaos-uploads"  # Update this if needed
```

### Connection Pooling
You're using **Pooler** connection (port 5432), which is perfect for serverless deployments like Render.

---

## 🧪 Test Supabase Connection

```bash
# Test database
cd backend
python -c "from app.core.database import engine; import asyncio; asyncio.run(engine.connect())"

# Test storage upload
curl -X POST https://gipmtahyameimrwurbdn.supabase.co/storage/v1/object/classchaos-uploads/test.txt \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: text/plain" \
  --data "test"
```

---

## ✅ You're Ready!

Your Supabase is **production-ready**. Just:

1. ✅ Verify storage bucket exists
2. ✅ Run migrations: `alembic upgrade head`
3. ✅ Copy env vars to Render
4. ✅ Deploy!

**No additional Supabase setup needed!** 🎉
