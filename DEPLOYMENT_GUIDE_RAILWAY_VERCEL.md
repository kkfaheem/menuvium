# Railway + Vercel Deployment Guide for Menuvium

**This guide provides step-by-step instructions for deploying Menuvium after migration from AWS CDK.**

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Backend Deployment (Railway)](#backend-deployment-railway)
3. [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
4. [Post-Deployment Configuration](#post-deployment-configuration)
5. [Troubleshooting](#troubleshooting)
6. [Rollback Instructions](#rollback-instructions)

---

## Quick Start

**Prerequisites:**
- GitHub account with repo access
- Railway account (railway.app)
- Vercel account (vercel.com)
- Your custom domain (e.g., yourdomain.com)
- AWS Cognito User Pool credentials (unchanged)

**Time Estimate:** 30-45 minutes for initial setup

---

## Backend Deployment (Railway)

### Step 1: Create Railway Project

```bash
# Option A: Using Railway CLI
npm install -g @railway/cli
railway login
cd /path/to/menuvium
railway init

# Select: Create a new project
# Project name: menuvium-api (or your choice)
```

**Option B: Using Railway Dashboard**
1. Go to https://railway.app
2. Click "Create New Project"
3. Select "Empty Project"
4. Name it "menuvium-api"

### Step 2: Add PostgreSQL Database

```bash
# Option A: Using Railway CLI
railway add

# Select: PostgreSQL
# This auto-generates DATABASE_URL
```

**Option B: Using Dashboard**
1. In project, click "+ Add"
2. Select "PostgreSQL"
3. Wait for provisioning

**Option C: Use External Database**
If you already have a PostgreSQL database (e.g., RDS):
- Skip the above steps
- You'll provide `DATABASE_URL` as env var

### Step 3: Deploy Application

```bash
# If using CLI (from menuvium repo root)
railway up

# If using GitHub integration:
# 1. Push code to GitHub
# 2. In Railway dashboard: Deployments tab
# 3. Click "Create a new deployment"
# 4. Select GitHub repo + branch
# 5. Railway auto-deploys on push
```

### Step 4: Configure Environment Variables

```bash
# Using CLI
railway variables set DATABASE_URL="postgresql://..." # (auto-set if using Railway DB)
railway variables set CORS_ORIGINS="https://app.yourdomain.com,https://www.yourdomain.com"
railway variables set ENVIRONMENT="production"
railway variables set RUN_MIGRATIONS="1"
railway variables set UVICORN_RELOAD="0"

railway variables set AWS_REGION="us-east-1"
railway variables set COGNITO_USER_POOL_ID="us-east-1_NzlQEewnE"
railway variables set COGNITO_CLIENT_ID="7mlaj0i1l97nq6e5p7h76llcoc"

railway variables set OPENAI_API_KEY="sk-proj-..."
railway variables set OPENAI_MODEL="gpt-4o-mini"

railway variables set OCR_MODE="pytesseract"  # or "textract" if keeping S3

# If using S3 (optional)
railway variables set S3_BUCKET_NAME="menuvium-ar-models"
railway variables set AWS_ACCESS_KEY_ID="..."
railway variables set AWS_SECRET_ACCESS_KEY="..."

# If using local uploads
railway variables set LOCAL_UPLOADS="1"
railway variables set UPLOAD_SECRET="your-random-secret-key"

# AR Worker token
railway variables set AR_WORKER_TOKEN="..."
```

**Using Dashboard:**
1. In project, go to "Variables" tab
2. Click "New Variable"
3. Add each variable from above
4. Click "Deploy" to restart service

### Step 5: Verify Deployment

```bash
# Check logs
railway logs

# Health check
curl https://<your-railway-api-domain>/health

# Expected response:
# {"status": "ok", "service": "menuvium-api"}

# Check database connection
railway logs | grep "Database connection ready"
```

### Step 6: Set Custom Domain (Optional)

```bash
# In Railway dashboard:
# 1. Go to "Settings" tab
# 2. Find "Service Domain"
# 3. Copy the Railway domain (*.railway.app)
# 4. Or add a custom domain:
#    - Go to "Deployments" → click current
#    - Add custom domain (e.g., api.yourdomain.com)
#    - Follow DNS instructions
```

**DNS Update (if using custom domain):**
```
CNAME api.yourdomain.com → <railway-domain>
```

---

## Frontend Deployment (Vercel)

### Step 1: Push Code to GitHub

```bash
git add .
git commit -m "Add railway.json and vercel.json configs"
git push origin main
```

### Step 2: Create Vercel Project

**Option A: Using Vercel Dashboard**
1. Go to https://vercel.com/dashboard
2. Click "Add New..." → "Project"
3. Select your GitHub repo
4. Vercel auto-detects Next.js setup
5. Click "Deploy"

**Option B: Using Vercel CLI**
```bash
npm install -g vercel
vercel login
cd apps/web
vercel
# Follow prompts, link to existing account
```

### Step 3: Configure Build Settings

In Vercel dashboard → Project Settings:

```
Build Command:     npm run build
Output Directory:  .next
Install Command:   npm ci (or npm install)
Node Version:      20.x
Root Directory:    apps/web  ← IMPORTANT for monorepo
```

### Step 4: Add Environment Variables

In Vercel → Settings → Environment Variables:

**Production Environment:**
```
NEXT_PUBLIC_USER_POOL_ID = us-east-1_NzlQEewnE
NEXT_PUBLIC_USER_POOL_CLIENT_ID = 7mlaj0i1l97nq6e5p7h76llcoc
NEXT_PUBLIC_COGNITO_DOMAIN = https://menuvium.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN = https://app.yourdomain.com/login
NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT = https://app.yourdomain.com/login
NEXT_PUBLIC_API_URL = https://api.yourdomain.com  (or Railway domain)
NEXT_PUBLIC_S3_BUCKET = menuvium-ar-models
API_INTERNAL_URL = https://api.yourdomain.com  (for server-side requests)
```

**Preview & Development (different redirect URIs if needed):**
```
NEXT_PUBLIC_USER_POOL_ID = us-east-1_NzlQEewnE
NEXT_PUBLIC_USER_POOL_CLIENT_ID = 7mlaj0i1l97nq6e5p7h76llcoc
NEXT_PUBLIC_COGNITO_DOMAIN = https://menuvium.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN = https://<preview>.vercel.app/login
NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT = https://<preview>.vercel.app/login
NEXT_PUBLIC_API_URL = https://api.yourdomain.com
NEXT_PUBLIC_S3_BUCKET = menuvium-ar-models
API_INTERNAL_URL = https://api.yourdomain.com
```

### Step 5: Trigger Deployment

- Vercel auto-deploys on push to `main` branch
- Or manually: Vercel dashboard → "Redeploy" button
- Preview deployments created on pull requests

### Step 6: Add Custom Domain

In Vercel → Settings → Domains:

1. Click "Add Domain"
2. Enter your domain (e.g., `app.yourdomain.com`)
3. Vercel shows DNS configuration
4. Add DNS records:
   ```
   CNAME app.yourdomain.com → cname.vercel.app
   ```
5. Wait 5-30 minutes for DNS propagation
6. Vercel auto-creates SSL certificate

---

## Post-Deployment Configuration

### Update Cognito OAuth Settings

AWS Console → Cognito → User Pools → menuvium → App Client Settings:

**Callback URLs (add new ones):**
```
https://app.yourdomain.com/login
https://www.<yourdomain.com>/login
```

**Sign-out URLs:**
```
https://app.yourdomain.com/login
https://www.yourdomain.com/login
```

**Allowed OAuth Flows:**
- Authorization code grant (should be enabled)

**Allowed Scopes:**
- email, openid, profile (should be enabled)

### Update Cognito Domain (if custom)

AWS Console → Cognito → App Integration → Domain Name:

Current: `menuvium.auth.us-east-1.amazoncognito.com`

This is automatically hosted and doesn't need changes unless you want a custom domain.

### Run Initial Database Migrations

If using new Railway PostgreSQL:

```bash
# Option 1: Automatic (on first deploy)
# Set RUN_MIGRATIONS=1 in Railway env vars
# This runs alembic upgrade head on startup

# Option 2: Manual
railway run alembic upgrade head

# Verify migration
railway logs | grep "Attempting to run"
```

### Seed Test Data (Optional)

If you have test data:

```bash
# From menuvium repo root
python seed_data.py  # (adjust for Railway connection)
```

Or use the API to create organizations/menus manually.

---

## Troubleshooting

### Issue: Deployment Fails

**Railway Logs:**
```bash
railway logs --follow
```

**Common errors:**
- `ModuleNotFoundError`: Missing dependency in requirements.txt
- `psycopg2` error: Database not accessible
- `PermissionError`: File permissions issue

**Fix steps:**
1. Check `services/api/requirements.txt` is complete
2. Verify `DATABASE_URL` is set correctly
3. Check database credentials
4. Redeploy: `railway up`

---

### Issue: Frontend Can't Connect to Backend

**Vercel Logs:**
```
vercel logs -f
```

**Check:**
1. Is `NEXT_PUBLIC_API_URL` set to correct backend URL?
2. Is backend CORS configured for frontend domain?
3. Is backend actually deployed and healthy?

**Fix:**
```bash
# Backend CORS
railway variables set CORS_ORIGINS="https://app.yourdomain.com,https://www.yourdomain.com"

# Frontend API URL
# Vercel dashboard → Environment Variables → update NEXT_PUBLIC_API_URL
```

---

### Issue: Login Redirects Not Working

**Check Cognito settings:**
1. AWS Console → Cognito → menuvium User Pool
2. App client → Hosted UI tab
3. Verify "Callback URLs" includes your Vercel domain
4. Verify "Allowed OAuth scopes" includes email, openid, profile

**Fix:**
1. Add your new domain to callback URLs
2. Click "Save"
3. Wait 2-3 minutes
4. Test login again

---

### Issue: File Uploads Failing

**If using S3:**
- Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set in Railway
- Check S3 bucket policy allows these credentials

**If using local uploads:**
- `LOCAL_UPLOADS` should be `1` in Railway
- Verify `UPLOAD_SECRET` is set

**Test upload:**
```bash
# Create a test organization and menu first
# Then try uploading a photo via UI
# Check Railway logs for errors
railway logs | grep -i upload
```

---

### Issue: Database Connection Timeout

**Check Railway PostgreSQL:**
1. In Railway project → PostgreSQL plugin
2. Verify it's running (green status)
3. Note the `DATABASE_URL` in variables

**Manually test:**
```bash
# Get DATABASE_URL from Railway
railway variables get DATABASE_URL

# Test connection
psql "postgres://user:password@host:port/menuvium" -c "SELECT version();"
```

---

### Issue: High Costs on Railway

**Check what's consuming:**
```bash
railway status  # Shows active services and costs
```

**Reduce costs:**
1. Stop unused services
2. Downgrade container size (if possible)
3. Use Railway's free tier for small projects

---

## Rollback Instructions

If something goes very wrong:

### Option 1: Temporary Rollback (Keep both running)

```bash
# Continue running old AWS stack
# Update DNS to point back to old ALB:
# In Route 53 or DNS provider:
CNAME api.yourdomain.com → <old-alb-dns>

# Update frontend to use old API:
# Vercel → Environment Variables → update NEXT_PUBLIC_API_URL
```

### Option 2: Delete Railway Project

If the new deployment is completely broken:

```bash
railway delete  # Deletes the Railway project
# Restore DNS and environment variables to point to old AWS stack
```

### Option 3: Restore Database from Snapshot

If database is corrupted:

```bash
# Option A: From RDS snapshot (if using external RDS)
# AWS Console → RDS → Snapshots → Restore

# Option B: From Railway backup (if available)
railway logs  # Check for backup info
```

---

## Verification Checklist

After deployment, verify:

- [ ] Backend health check passes: `curl https://<api-domain>/health`
- [ ] Frontend loads: Visit `https://app.yourdomain.com`
- [ ] Login flow works: Can log in via Cognito
- [ ] File uploads work: Can upload a menu photo
- [ ] Database works: Can view organizations/menus
- [ ] API endpoints work: Check in browser console (Network tab)
- [ ] OCR works: Can import a PDF menu
- [ ] AR features work: If applicable
- [ ] Emails send: If applicable
- [ ] No console errors: Check browser dev tools
- [ ] Performance is acceptable: Under 3s page load

---

## Production Monitoring

### Set Up Alerts

**Railway:**
```bash
# Monitor in dashboard or CLI
railway logs --follow
```

**Vercel:**
- Vercel automatically monitors errors
- Check Analytics dashboard for performance

### Weekly Checks

- [ ] Check Railway/Vercel logs for errors
- [ ] Monitor costs (should be lower than AWS)
- [ ] Test a login flow manually
- [ ] Check for new dependency updates

---

## Support Resources

- **Railway Docs:** https://docs.railway.app
- **Vercel Docs:** https://vercel.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **FastAPI Docs:** https://fastapi.tiangolo.com
- **AWS Cognito:** https://docs.aws.amazon.com/cognito/

---

**Last Updated:** February 2026  
**Author:** Migration Guide  
**Status:** Ready for Production
