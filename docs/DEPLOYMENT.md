# 🚀 Vercel Deployment Guide

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Vercel        │     │   Railway/      │     │   Supabase      │
│   (Frontend)    │────▶│   Render        │────▶│   (Database)    │
│   React + Vite  │     │   (Backend)     │     │   PostgreSQL    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Step 1: Deploy Backend First (Railway - Recommended)

### 1.1 Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### 1.2 Deploy Backend
1. Click **"New Project"** → **"Deploy from GitHub repo"**
2. Select your `MabiniLMS` repository
3. Railway will detect it - click **"Add Service"** → **"GitHub Repo"**
4. In settings, set:
   - **Root Directory**: `server`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

### 1.3 Add Environment Variables
In Railway dashboard → Variables, add:

```
NODE_ENV=production
PORT=3000
SUPABASE_URL=https://bwzqqifuwqpzfvauwgqq.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
JWT_SECRET=your_jwt_secret
CORS_ORIGIN=https://your-app.vercel.app
```

### 1.4 Get Your Backend URL
After deployment, Railway gives you a URL like:
`https://mabinilms-production.up.railway.app`

**Save this URL** - you'll need it for the frontend.

---

## Step 2: Deploy Frontend (Vercel)

### 2.1 Install Vercel CLI (Optional)
```bash
npm install -g vercel
```

### 2.2 Deploy via Vercel Dashboard
1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub
3. Click **"Add New Project"**
4. Import your `MabiniLMS` repository
5. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 2.3 Add Environment Variables
In Vercel dashboard → Settings → Environment Variables, add:

```
VITE_API_URL=https://your-backend.up.railway.app/api
VITE_SUPABASE_URL=https://bwzqqifuwqpzfvauwgqq.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

### 2.4 Deploy
Click **"Deploy"** and wait for it to complete.

---

## Step 3: Update OAuth Redirect URLs

### 3.1 Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. APIs & Services → Credentials → Your OAuth Client
3. Add to **Authorized redirect URIs**:
   ```
   https://bwzqqifuwqpzfvauwgqq.supabase.co/auth/v1/callback
   ```

### 3.2 Supabase Dashboard
1. Go to Supabase → Authentication → URL Configuration
2. Update **Site URL** to your Vercel domain:
   ```
   https://your-app.vercel.app
   ```
3. Add to **Redirect URLs**:
   ```
   https://your-app.vercel.app/**
   ```

---

## Step 4: Update Backend CORS

After getting your Vercel URL, update Railway environment variable:

```
CORS_ORIGIN=https://your-app.vercel.app
```

---

## Quick Deploy Commands

### Deploy Frontend Only (after initial setup)
```bash
cd client
vercel --prod
```

### Deploy Backend Only (Railway CLI)
```bash
cd server
railway up
```

---

## Troubleshooting

### "CORS Error"
- Ensure `CORS_ORIGIN` in Railway matches your Vercel domain exactly
- No trailing slash!

### "API Connection Failed"
- Check `VITE_API_URL` in Vercel matches your Railway URL
- Include `/api` at the end: `https://your-backend.railway.app/api`

### "Google Login Not Working"
- Add your Vercel domain to Google OAuth authorized origins
- Update Supabase Site URL and Redirect URLs

### "500 Error on API"
- Check Railway logs for errors
- Verify all environment variables are set

---

## Environment Variables Summary

### Frontend (Vercel)
| Variable | Example |
|----------|---------|
| `VITE_API_URL` | `https://mabinilms-api.railway.app/api` |
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` |
| `VITE_GOOGLE_CLIENT_ID` | `123...apps.googleusercontent.com` |

### Backend (Railway)
| Variable | Example |
|----------|---------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `eyJ...` (service role key) |
| `SUPABASE_ANON_KEY` | `eyJ...` |
| `JWT_SECRET` | `your-secret-key` |
| `CORS_ORIGIN` | `https://your-app.vercel.app` |

---

## Custom Domain (Optional)

### Vercel
1. Settings → Domains → Add
2. Add your domain (e.g., `mabini-classroom.com`)
3. Update DNS records as instructed

### Don't forget to update:
- Google OAuth authorized origins
- Supabase Site URL and Redirect URLs
- Railway CORS_ORIGIN
