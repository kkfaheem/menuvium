# Migration Checklist: AWS CDK → Railway + Vercel

**Print this out or save to your project. Check off items as you complete them.**

---

## Pre-Migration (Before Starting)

### Research & Planning
- [ ] Read `MIGRATION_SUMMARY.md` (Executive Summary)
- [ ] Read `MIGRATION_TO_RAILWAY_VERCEL.md` (Detailed Analysis)
- [ ] Choose your strategy:
  - [ ] Strategy 1: Keep S3 (minimal changes)
  - [ ] Strategy 2: Local storage + keep S3 (medium changes)
  - [ ] Strategy 3: Full independence (major changes)
- [ ] Decide on database:
  - [ ] Railway PostgreSQL (managed, simpler)
  - [ ] External RDS (existing setup)
  - [ ] Other (specify: ____________)
- [ ] Estimated timeline approved by team
- [ ] Stakeholders notified of migration plan

### Accounts & Access
- [ ] GitHub account and repo access verified
- [ ] Create Railway account (railway.app)
- [ ] Create Vercel account (vercel.com)
- [ ] AWS console access (for Cognito, S3, RDS)
- [ ] Domain registrar access (for DNS changes)

### Backup & Safety
- [ ] Take RDS snapshot (if migrating DB)
- [ ] Export current Cognito user pool settings
- [ ] Document current DNS records
- [ ] Document current environment variables
- [ ] Verify AWS CDK stack can be kept running

---

## Phase 1: Code Preparation

### Code Changes (if not Strategy 1)
- [ ] Read `OPTIONAL_CODE_CHANGES.md`
- [ ] Apply S3 migration changes (if applicable):
  - [ ] Update `services/api/routers/items.py`
  - [ ] Update `services/api/routers/imports.py`
  - [ ] Update `services/api/requirements.txt`
- [ ] Test code changes locally:
  - [ ] Run `pytest` in services/api
  - [ ] Test file upload endpoint
  - [ ] Test OCR endpoint
- [ ] Commit changes: `git commit -m "Prepare for Railway migration"`
- [ ] Push to GitHub: `git push origin main`

### Configuration Files (Already Created)
- [ ] Review `railway.json` (in repo root)
- [ ] Review `vercel.json` (in repo root)
- [ ] Review `.env.example.railway-vercel` (reference only)
- [ ] No changes needed unless strategy changed

---

## Phase 2: Railway Backend Setup

### Create Railway Project
- [ ] Install Railway CLI: `npm install -g @railway/cli`
- [ ] Login to Railway: `railway login`
- [ ] Initialize project: `railway init`
- [ ] Name project: "menuvium-api"
- [ ] Repository linked (or will link in next step)
- [ ] Verify project created in Railway dashboard

### Add Database
- [ ] Choose database option:
  - [ ] Add Railway PostgreSQL: `railway add` → select PostgreSQL
  - [ ] Use external RDS: Skip this step, will add DATABASE_URL manually
- [ ] If Railway DB:
  - [ ] Verify DATABASE_URL auto-generated
  - [ ] Note: Database name = "postgres" by default
- [ ] Database ready for connection

### Link GitHub Repository
- [ ] Connect GitHub repo to Railway:
  - [ ] Via CLI: `railway link`
  - [ ] Or via dashboard: Add GitHub repo
- [ ] Select correct branch (main)
- [ ] Verify railway.json is recognized
- [ ] Verify Dockerfile path is correct

### Configure Environment Variables

**Database Variables:**
- [ ] Set DATABASE_URL or individual DB_* variables
  - [ ] `railway variables set DATABASE_URL="..."`
  - [ ] OR: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

**API Configuration:**
- [ ] `CORS_ORIGINS=https://app.yourdomain.com,https://www.yourdomain.com`
- [ ] `ENVIRONMENT=production`
- [ ] `RUN_MIGRATIONS=1`
- [ ] `UVICORN_RELOAD=0`
- [ ] `AWS_REGION=us-east-1`

**Authentication (Cognito):**
- [ ] `COGNITO_USER_POOL_ID=us-east-1_NzlQEewnE`
- [ ] `COGNITO_CLIENT_ID=7mlaj0i1l97nq6e5p7h76llcoc`

**OpenAI:**
- [ ] `OPENAI_API_KEY=sk-proj-...` (from .env)
- [ ] `OPENAI_MODEL=gpt-4o-mini`

**Storage (Strategy-dependent):**
- [ ] **Strategy 1 (Keep S3):**
  - [ ] `S3_BUCKET_NAME=menuvium-ar-models`
  - [ ] `AWS_ACCESS_KEY_ID=...` (new IAM user)
  - [ ] `AWS_SECRET_ACCESS_KEY=...`
  - [ ] `OCR_MODE=textract`
  
- [ ] **Strategy 2-3 (Local):**
  - [ ] `LOCAL_UPLOADS=1`
  - [ ] `UPLOAD_SECRET=` (random 32+ char string)
  - [ ] `OCR_MODE=pytesseract`

**Other:**
- [ ] `AR_WORKER_TOKEN=...` (from .env)

### Deploy Backend
- [ ] Push code to main: `git push origin main`
  - [ ] Or: `railway up` (CLI deploy)
- [ ] Monitor deployment: `railway logs -f`
- [ ] Wait for "Deployment successful" message
- [ ] Note the Railway API URL (something.railway.app)

### Verify Backend Works
- [ ] Health check: `curl https://<railway-url>/health`
  - Expected: `{"status": "ok", "service": "menuvium-api"}`
- [ ] Check logs for migrations: `railway logs | grep -i migration`
  - Expected: "Running database migrations..." and "alembic upgrade head"
- [ ] Verify database connection: `railway logs | grep -i "database"`
  - Expected: No connection errors
- [ ] No critical errors in logs

---

## Phase 3: Vercel Frontend Setup

### Create Vercel Project
- [ ] Install Vercel CLI: `npm install -g vercel`
- [ ] Login to Vercel: `vercel login`
- [ ] Go to vercel.com dashboard
- [ ] Click "Add New Project"
- [ ] Select GitHub repo (menuvium)
- [ ] Vercel auto-detects Next.js
- [ ] Set root directory: `apps/web`
- [ ] Click "Deploy"

### Configure Build Settings
- [ ] Verify Build Command: `npm run build`
- [ ] Verify Output Directory: `.next`
- [ ] Verify Node Version: `20.x`
- [ ] Verify Root: `apps/web` (monorepo setting)

### Configure Environment Variables (Production)

**Frontend (Public):**
- [ ] `NEXT_PUBLIC_USER_POOL_ID=us-east-1_NzlQEewnE`
- [ ] `NEXT_PUBLIC_USER_POOL_CLIENT_ID=7mlaj0i1l97nq6e5p7h76llcoc`
- [ ] `NEXT_PUBLIC_COGNITO_DOMAIN=https://menuvium.auth.us-east-1.amazoncognito.com`
- [ ] `NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN=https://app.yourdomain.com/login`
- [ ] `NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT=https://app.yourdomain.com/login`
- [ ] `NEXT_PUBLIC_API_URL=https://api.yourdomain.com` (or Railway domain for now)
- [ ] `NEXT_PUBLIC_S3_BUCKET=menuvium-ar-models`

**Backend (Server-side):**
- [ ] `API_INTERNAL_URL=https://api.yourdomain.com` (same as NEXT_PUBLIC for now)

### Add Custom Domain (Optional, can wait)
- [ ] In Vercel: Settings → Domains
- [ ] Add `app.yourdomain.com`
- [ ] Note the DNS records to add
- [ ] (Will do DNS update in Phase 4)

### Deploy Frontend
- [ ] All environment variables set ✓
- [ ] Vercel auto-deploys from main branch
- [ ] Or manually: `vercel deploy --prod`
- [ ] Monitor deployment in Vercel dashboard

### Verify Frontend Works
- [ ] Vercel deployment shows "Ready"
- [ ] Visit Vercel preview URL (*.vercel.app)
- [ ] Page loads without errors
- [ ] No console errors in dev tools
- [ ] Login button visible

---

## Phase 4: DNS & Domain Configuration

### Update Cognito (Critical)
- [ ] Go to AWS Console → Cognito → User Pools → menuvium
- [ ] Click "App client" → "App client settings"
- [ ] Scroll to "Callback URLs"
- [ ] Add: `https://app.yourdomain.com/login`
- [ ] Scroll to "Sign out URLs"
- [ ] Add: `https://app.yourdomain.com/login`
- [ ] Scroll to "Allowed OAuth flows"
- [ ] Verify "Authorization code grant" is enabled
- [ ] Verify scopes: email, openid, profile enabled
- [ ] Click "Save changes"
- [ ] Wait 2-3 minutes for changes to propagate

### Update DNS Records

**For Railway API (if using custom domain):**
- [ ] Add CNAME record:
  - [ ] Host: `api.yourdomain.com`
  - [ ] Points to: (Railway domain from dashboard)
  - [ ] TTL: 3600 or default
- [ ] Wait for DNS propagation (5-30 minutes)
- [ ] Test: `nslookup api.yourdomain.com`

**For Vercel Frontend (if using custom domain):**
- [ ] Add CNAME record:
  - [ ] Host: `app.yourdomain.com`
  - [ ] Points to: `cname.vercel.app`
  - [ ] TTL: 3600 or default
- [ ] Wait for DNS propagation (5-30 minutes)
- [ ] Vercel will auto-provision SSL certificate

### Verify DNS & SSL
- [ ] DNS resolves: `nslookup api.yourdomain.com`
- [ ] DNS resolves: `nslookup app.yourdomain.com`
- [ ] SSL certificate auto-created by Vercel
- [ ] HTTPS works: `curl -I https://app.yourdomain.com`

---

## Phase 5: Testing & Verification

### Frontend Verification
- [ ] [ ] Visit `https://app.yourdomain.com` (or Vercel URL)
- [ ] [ ] Page loads without errors
- [ ] [ ] No 404 errors
- [ ] [ ] Check browser console for errors
- [ ] [ ] Logo and theme visible

### Login Flow
- [ ] [ ] Click "Login" button
- [ ] [ ] Redirects to Cognito hosted UI (menuvium.auth.us-east-1.amazoncognito.com)
- [ ] [ ] Can enter username/password
- [ ] [ ] After login, redirects back to dashboard
- [ ] [ ] Dashboard loads with user's data
- [ ] [ ] User menu shows logged-in email
- [ ] [ ] Can view organizations and menus

### API Connectivity
- [ ] [ ] Open browser DevTools (Network tab)
- [ ] [ ] Trigger API call (e.g., load organizations)
- [ ] [ ] Check that request goes to correct API URL
- [ ] [ ] Response is 200 (not 404 or 500)
- [ ] [ ] Data displays correctly

### File Upload (if applicable)
- [ ] [ ] Create or edit a menu item
- [ ] [ ] Try uploading a photo
- [ ] [ ] Upload succeeds without error
- [ ] [ ] Photo displays in item
- [ ] [ ] Photo is accessible (check URL)

### Database Query
- [ ] [ ] Create a new menu (if permission)
- [ ] [ ] Create a new category
- [ ] [ ] Add items
- [ ] [ ] Verify data saves to database
- [ ] [ ] Close browser and reopen
- [ ] [ ] Data still there (not lost)

### OCR/Import (if applicable)
- [ ] [ ] Try importing a PDF menu
- [ ] [ ] OCR processes correctly
- [ ] [ ] Items extracted from PDF
- [ ] [ ] Items display in menu

### Performance
- [ ] [ ] Page load time: < 3 seconds
- [ ] [ ] No slow network requests
- [ ] [ ] No memory leaks (check DevTools)
- [ ] [ ] API responses < 1 second

### Error Logging
- [ ] [ ] Check Railway logs: `railway logs`
  - [ ] No 500 errors
  - [ ] No database connection errors
  - [ ] No auth failures
- [ ] [ ] Check Vercel logs: `vercel logs`
  - [ ] No build errors
  - [ ] No deployment errors

---

## Phase 6: Post-Deployment

### Monitoring Setup
- [ ] [ ] Set up Railway alerts (optional)
- [ ] [ ] Set up Vercel alerts (automatic)
- [ ] [ ] Monitor logs for first 24 hours
- [ ] [ ] Watch for error spikes

### Keep Backup Running
- [ ] [ ] AWS CDK stack still running
- [ ] [ ] RDS still available
- [ ] [ ] S3 bucket accessible
- [ ] [ ] Cognito still configured (original)

### Cost Monitoring
- [ ] [ ] Check Railway costs dashboard
- [ ] [ ] Check Vercel costs dashboard
- [ ] [ ] Compare to AWS costs
- [ ] [ ] Verify savings ~40-50%

### Documentation Update
- [ ] [ ] Update README with new deployment info
- [ ] [ ] Update docs with Railway/Vercel links
- [ ] [ ] Add troubleshooting guide to repo
- [ ] [ ] Document any custom settings

### Notify Team
- [ ] [ ] Announce migration complete
- [ ] [ ] Share new URLs (api.*, app.*)
- [ ] [ ] Provide monitoring dashboard links
- [ ] [ ] List contacts for support

---

## Phase 7: Cleanup (After 1-2 Weeks)

### Verify Stability
- [ ] [ ] Running on Railway/Vercel for 7+ days
- [ ] [ ] No critical errors
- [ ] [ ] All features working
- [ ] [ ] Users experiencing no issues
- [ ] [ ] Performance acceptable

### AWS Cleanup (Optional)
- [ ] [ ] Delete AWS CDK stack
  - [ ] `cdk destroy` (after backup)
  - [ ] Confirm deletion
- [ ] [ ] Delete ECR repository (menuvium-api)
- [ ] [ ] Delete Amplify app (if not using)
- [ ] [ ] Keep RDS snapshot (for archive)
- [ ] [ ] Keep S3 bucket (if using)

### Final Documentation
- [ ] [ ] Archive old deployment guide
- [ ] [ ] Update infrastructure docs
- [ ] [ ] Document lessons learned
- [ ] [ ] Add post-mortem (if any issues)

### Keep Records
- [ ] [ ] Save Railway/Vercel project IDs
- [ ] [ ] Document all environment variables
- [ ] [ ] Keep copy of old DNS records
- [ ] [ ] Keep AWS stack config (archived)

---

## Troubleshooting Quick Links

| Issue | Reference |
|-------|-----------|
| Backend won't deploy | `DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md` → Troubleshooting |
| Frontend can't connect to API | Check CORS_ORIGINS and NEXT_PUBLIC_API_URL |
| Login redirects broken | Check Cognito callback URLs updated |
| File upload failing | Check LOCAL_UPLOADS or S3_BUCKET_NAME settings |
| Database errors | Check DATABASE_URL and DB_PASSWORD |
| High costs | Check Railway/Vercel usage, consider downsizing |

---

## Emergency Rollback

If something critically breaks:

### Immediate Actions
- [ ] [ ] Stop new deployments to Railway/Vercel
- [ ] [ ] Alert team of issues
- [ ] [ ] Check Railway logs: `railway logs | grep -i error`
- [ ] [ ] Check Vercel logs: `vercel logs`

### Rollback to AWS
- [ ] [ ] Update DNS CNAME to point back to AWS ALB
- [ ] [ ] Update Vercel environment variables to old API URL
- [ ] [ ] Wait 5-10 minutes for DNS propagation
- [ ] [ ] Test: Can users access app?

### Investigation
- [ ] [ ] Collect error logs
- [ ] [ ] Review recent changes
- [ ] [ ] Check resource usage (CPU, memory, disk)
- [ ] [ ] Verify database connection

### Recovery
- [ ] [ ] Fix identified issue
- [ ] [ ] Redeploy to Railway
- [ ] [ ] Test staging environment first
- [ ] [ ] Gradually shift traffic back to Railway

---

## Final Sign-Off

- [ ] **Migration Date:** _______________
- [ ] **Lead:** _______________
- [ ] **Reviewer:** _______________
- [ ] **Approval:** _______________

**Notes:**
```
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
```

---

**Estimated Time Per Phase:**
- Phase 1 (Code): 1-2 hours
- Phase 2 (Railway): 30-45 minutes
- Phase 3 (Vercel): 20-30 minutes
- Phase 4 (DNS): 10-20 minutes
- Phase 5 (Testing): 1-2 hours
- **Total: 4-6 hours** (plus DNS propagation time)

**Total Calendar Time: 1-3 days** (including DNS propagation and verification)
