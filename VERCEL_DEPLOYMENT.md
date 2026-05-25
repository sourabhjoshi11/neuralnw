# 🚀 Vercel Deployment Settings

## Project Settings

```
Framework Preset: Other
Root Directory: frontend
Build Command: npx expo export --platform web
Output Directory: dist
Install Command: npm install
```

## Environment Variables

Add these in Vercel Dashboard → Settings → Environment Variables:

```env
EXPO_PUBLIC_API_URL=https://classchaos-backend.onrender.com
EXPO_PUBLIC_WS_URL=wss://classchaos-backend.onrender.com
```

## Step-by-Step

### 1. Import Project
- Go to https://vercel.com/new
- Import from GitHub: `sourabhjoshi11/neuralnw`
- Click "Import"

### 2. Configure Project
```
Framework Preset: Other
Root Directory: frontend
```

### 3. Build Settings (Override)
```
Build Command: npx expo export --platform web
Output Directory: dist
Install Command: npm install
```

### 4. Environment Variables
Click "Add" for each:
```
EXPO_PUBLIC_API_URL → https://classchaos-backend.onrender.com
EXPO_PUBLIC_WS_URL → wss://classchaos-backend.onrender.com
```

### 5. Deploy
- Click "Deploy"
- Wait 2-3 minutes
- Done! ✅

## Custom Domain

After deployment:

1. Go to Project Settings → Domains
2. Add: `classchaos.app`
3. Add DNS records (Vercel will show you):
   ```
   Type: A
   Name: @
   Value: 76.76.21.21

   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```

## Troubleshooting

### Build fails with "expo: command not found"
✅ Already fixed - using `npx expo` in vercel.json

### 404 on routes
✅ Already fixed - rewrites configured in vercel.json

### API not connecting
- Check environment variables are set
- Verify backend URL is correct
- Check CORS in backend includes Vercel domain

## Quick Deploy Command

```bash
cd frontend
vercel --prod
```

**Estimated time: 5 minutes** ⏱️
