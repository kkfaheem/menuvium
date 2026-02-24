# Menuvium: AWS CDK → Railway + Vercel Migration Guide

**Prepared:** February 23, 2026  
**Status:** Ready for Implementation

---

## Executive Summary

Your Menuvium application currently uses:
- **AWS Infrastructure:** CDK with Fargate (API), RDS (PostgreSQL), S3 (storage), Cognito (auth), Amplify (frontend), CloudFront (CDN)
- **AWS SDK Integration:** `boto3` for S3 presigned URLs and AWS Textract OCR

**Migration Plan:**
- **Backend:** AWS Fargate → Railway (native Docker support)
- **Frontend:** AWS Amplify → Vercel  
- **Database:** AWS RDS → Railway PostgreSQL (or keep external)
- **File Storage:** AWS S3 + presigned URLs → Railway Postgres + streaming OR S3 (keep it)
- **Authentication:** AWS Cognito → Keep as-is (Railway/Vercel don't need changes for this)
- **OCR:** AWS Textract → pytesseract only (or keep S3 + Textract)

---

## Part 1: Codebase Analysis

### AWS SDK Usage Found

#### 1. **S3 Presigned URLs** (`services/api/routers/items.py`)
- `boto3.client('s3')` → `generate_presigned_url('put_object')`
- Used for: Direct file uploads from frontend to S3
- Current: Returns `{upload_url, s3_key, public_url}`

#### 2. **AWS Textract** (`services/api/routers/imports.py`)
- `boto3.client('s3')` + `boto3.client('textract')`
- Used for: OCR of scanned PDFs
- Current: Uploads PDF to S3, calls Textract API

#### 3. **Frontend Auth** (`apps/web/src/components/AmplifyProvider.tsx`)
- Uses AWS Amplify SDK for Cognito integration
- Can continue as-is (Cognito is region-based, no infrastructure needed)

### Current Environment Variables

**Backend (`services/api/`):**
```
# Auth (Cognito)
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_NzlQEewnE
COGNITO_CLIENT_ID=7mlaj0i1l97nq6e5p7h76llcoc

# Storage
S3_BUCKET_NAME=menuvium-ar-models
LOCAL_UPLOADS=0|1  # Can disable S3 for local testing

# Database
DATABASE_URL=postgresql://...  (OR individual: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)

# API Config
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
OCR_MODE=textract|pytesseract

# Deployment
ENVIRONMENT=dev|staging|prod
RUN_MIGRATIONS=1
UVICORN_RELOAD=0|1
SQL_ECHO=0|1
```

**Frontend (`apps/web/`):**
```
NEXT_PUBLIC_USER_POOL_ID=us-east-1_NzlQEewnE
NEXT_PUBLIC_USER_POOL_CLIENT_ID=7mlaj0i1l97nq6e5p7h76llcoc
NEXT_PUBLIC_COGNITO_DOMAIN=https://menuvium.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN=https://app.yourdomain.com/login
NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT=https://app.yourdomain.com/login
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_S3_BUCKET=menuvium-ar-models

# For server-side API proxying
API_INTERNAL_URL=http://localhost:8000  (or internal Railway URL)
```

---

## Part 2: Required Code Changes

### Option A: Keep AWS S3 (Minimal Changes)
**Pros:** No code changes needed; keeps existing infrastructure  
**Cons:** AWS costs continue; IAM management still needed

**What to do:** Just set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as Railway/Vercel env vars.

---

### Option B: Migrate to File Storage (More Changes)
**Pros:** Fully independent from AWS; simpler auth model  
**Cons:** Code changes needed; storage cost trade-offs

#### Change 1: Modify `services/api/routers/items.py`

Replace S3 presigned URL generation with direct upload endpoint:

```python
# OLD (lines 80-114)
@router.post("/upload-url", response_model=PresignedUrlResponse)
def generate_upload_url(req: PresignedUrlRequest, request: Request, user: dict = UserDep):
    bucket_name = os.getenv("S3_BUCKET_NAME")
    if not bucket_name:
        if _local_uploads_enabled():
            # ... local upload logic
        raise HTTPException(status_code=500, detail="S3 configuration missing")
    
    s3_client = boto3.client('s3')
    key = f"items/{uuid.uuid4()}-{req.filename}"
    
    response = s3_client.generate_presigned_url('put_object', ...)
    return {
        "upload_url": response,
        "s3_key": key,
        "public_url": f"https://{bucket_name}.s3.amazonaws.com/{key}"
    }
```

**Replace with:**

```python
@router.post("/upload-url", response_model=PresignedUrlResponse)
def generate_upload_url(req: PresignedUrlRequest, request: Request, user: dict = UserDep):
    # Generate a signed token valid for 1 hour
    import hmac
    import hashlib
    from datetime import datetime, timedelta
    
    key = f"items/{uuid.uuid4()}-{req.filename}"
    upload_token = generate_upload_token(key)  # See below
    
    upload_url = f"{forwarded_prefix(request)}/items/upload/{upload_token}"
    
    return {
        "upload_url": upload_url,
        "s3_key": key,
        "public_url": f"{forwarded_prefix(request)}/uploads/{key}"
    }

def generate_upload_token(key: str) -> str:
    """Generate a secure, time-limited upload token."""
    secret = os.getenv("UPLOAD_SECRET", "change-me-in-prod")
    expiry = (datetime.utcnow() + timedelta(hours=1)).isoformat()
    
    data = f"{key}:{expiry}".encode()
    sig = hmac.new(secret.encode(), data, hashlib.sha256).hexdigest()
    return f"{key}:{expiry}:{sig}"

@router.post("/items/upload/{token}")
async def upload_file(token: str, file: UploadFile):
    """Direct file upload endpoint (no presigned URLs needed)."""
    key, expiry_str, sig = token.rsplit(":", 2)
    
    # Verify token
    secret = os.getenv("UPLOAD_SECRET", "change-me-in-prod")
    expected_sig = hmac.new(
        secret.encode(),
        f"{key}:{expiry_str}".encode(),
        hashlib.sha256
    ).hexdigest()
    
    if sig != expected_sig or datetime.fromisoformat(expiry_str) < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Invalid or expired upload token")
    
    # Store file
    if _local_uploads_enabled():
        target_path = _local_upload_dir() / key
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(await file.read())
    else:
        # Option 1: Use S3 if available
        s3_client = boto3.client('s3')
        s3_client.upload_fileobj(file.file, os.getenv("S3_BUCKET_NAME"), key)
        
        # Option 2: Store in database as BLOB (if small files)
        # file_data = await file.read()
        # store_in_db(key, file_data)
    
    return {"status": "ok", "key": key}
```

#### Change 2: Modify `services/api/routers/imports.py` (OCR)

Replace AWS Textract with local pytesseract only:

```python
# OLD (lines 97-106)
def _ocr_with_textract(file: UploadFile) -> str:
    bucket = os.getenv("S3_BUCKET_NAME")
    if not bucket:
        raise HTTPException(status_code=500, detail="S3_BUCKET_NAME is required for Textract OCR")
    
    s3 = boto3.client("s3")
    textract = boto3.client("textract")
    s3.upload_fileobj(file.file, bucket, key, ExtraArgs={"ContentType": file.content_type})
    response = textract.detect_document_text(
        Document={"S3Object": {"Bucket": bucket, "Name": key}}
    )
    ...
```

**Replace with:**

```python
def _ocr_with_pytesseract(file: UploadFile) -> str:
    """Use only local pytesseract (no AWS Textract dependency)."""
    content = file.file.read()
    
    if file.content_type == "application/pdf":
        text_parts: List[str] = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                image = page.convert_image(fmt="ppm")
                text = pytesseract.image_to_string(image)
                text_parts.append(text)
        return "\n".join(text_parts).strip()
    
    # For images
    image = Image.open(io.BytesIO(content)).convert("RGB")
    return pytesseract.image_to_string(image)

# In import endpoints, change:
# if ocr_mode == "textract":
#     text = _ocr_with_textract(file)
# To:
if ocr_mode in ["textract", "pytesseract"]:  # Fallback to pytesseract
    text = _ocr_with_pytesseract(file)
```

#### Change 3: Remove boto3 from requirements (Optional)

If not using S3 presigned URLs anymore:

```bash
# OLD: requirements.txt includes boto3
boto3

# NEW: Remove if not using S3
# boto3  # <- Remove this line
```

---

## Part 3: Railway Deployment Configuration

### Create `railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "dockerfile",
    "buildpacks": []
  },
  "deploy": {
    "startCommand": "sh /app/start.sh",
    "restartPolicyType": "on_failure",
    "restartPolicyMaxRetries": 5
  }
}
```

### Create `Procfile` (Alternative to railway.json)

```procfile
web: sh /app/start.sh
```

### Railway Environment Variables

**Required:**

```
# Database (Railway will generate DATABASE_URL automatically, or use external)
DATABASE_URL=postgresql://user:password@host:5432/menuvium
# OR individual:
DB_HOST=your-postgres-host
DB_PORT=5432
DB_NAME=menuvium
DB_USER=postgres
DB_PASSWORD=...

# API Config
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
ENVIRONMENT=production
RUN_MIGRATIONS=1
UVICORN_RELOAD=0

# Auth (Keep Cognito setup)
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_NzlQEewnE
COGNITO_CLIENT_ID=7mlaj0i1l97nq6e5p7h76llcoc

# OpenAI
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini

# Storage (Choose one)
# Option A: Keep S3
S3_BUCKET_NAME=menuvium-ar-models
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
OCR_MODE=textract

# Option B: Local/Railway storage
LOCAL_UPLOADS=1
OCR_MODE=pytesseract
UPLOAD_SECRET=your-random-secret-key-here

# AR Worker
AR_WORKER_TOKEN=...
```

### Railway Deployment Steps

1. **Create Railway Account & Project**
   ```bash
   # Install Railway CLI
   npm i -g @railway/cli
   railway login
   railway init  # Select existing project or create new
   ```

2. **Add PostgreSQL Plugin** (if using Railway DB)
   ```bash
   railway add  # Select PostgreSQL from list
   ```

3. **Set Environment Variables**
   ```bash
   railway variables set DATABASE_URL="postgresql://..."
   railway variables set COGNITO_USER_POOL_ID="us-east-1_NzlQEewnE"
   # ... set all required vars above
   ```

4. **Deploy**
   ```bash
   railway up
   # Or push to GitHub + link repo:
   railway link  # Connect GitHub repo
   # Railway will auto-deploy on push to main
   ```

5. **Verify Deployment**
   ```bash
   railway logs  # Stream logs
   railway status  # Check health
   ```

---

## Part 4: Vercel Deployment Configuration

### Create `vercel.json`

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "env": [
    "NEXT_PUBLIC_USER_POOL_ID",
    "NEXT_PUBLIC_USER_POOL_CLIENT_ID",
    "NEXT_PUBLIC_COGNITO_DOMAIN",
    "NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN",
    "NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_S3_BUCKET",
    "API_INTERNAL_URL"
  ],
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "$NEXT_PUBLIC_API_URL/api/:path*"
    }
  ],
  "redirects": [
    {
      "source": "/r/:id",
      "destination": "/public-menu/r/:id",
      "permanent": true
    }
  ]
}
```

### Vercel Environment Variables

**In Vercel Dashboard → Settings → Environment Variables:**

```
# Production
NEXT_PUBLIC_USER_POOL_ID=us-east-1_NzlQEewnE
NEXT_PUBLIC_USER_POOL_CLIENT_ID=7mlaj0i1l97nq6e5p7h76llcoc
NEXT_PUBLIC_COGNITO_DOMAIN=https://menuvium.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN=https://app.yourdomain.com/login
NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT=https://app.yourdomain.com/login
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_S3_BUCKET=menuvium-ar-models
API_INTERNAL_URL=https://api.yourdomain.com  # For server-side requests

# Preview/Development
NEXT_PUBLIC_USER_POOL_ID=us-east-1_NzlQEewnE  # (same pool for all envs)
NEXT_PUBLIC_USER_POOL_CLIENT_ID=7mlaj0i1l97nq6e5p7h76llcoc
NEXT_PUBLIC_COGNITO_DOMAIN=https://menuvium.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN=https://preview-app.yourdomain.com/login
NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT=https://preview-app.yourdomain.com/login
NEXT_PUBLIC_API_URL=https://preview-api.yourdomain.com
NEXT_PUBLIC_S3_BUCKET=menuvium-ar-models
API_INTERNAL_URL=https://preview-api.yourdomain.com
```

### Vercel Deployment Steps

1. **Connect GitHub Repository**
   - Go to vercel.com → Import Project
   - Select your GitHub repo
   - Vercel auto-detects Next.js

2. **Configure Build Settings**
   - Build Command: `npm run build` (auto-detected)
   - Output Directory: `.next` (auto-detected)
   - Install Command: `npm ci` (auto-detected)

3. **Add Environment Variables**
   - In Vercel dashboard, go to Settings → Environment Variables
   - Add all variables from section above
   - Can set different values for Production, Preview, Development

4. **Deploy**
   - Vercel auto-deploys on push to main branch
   - Preview deployments on pull requests

5. **Configure Custom Domains**
   - Add your domain (e.g., `app.yourdomain.com`)
   - Point DNS to Vercel (settings provided in dashboard)

---

## Part 5: Additional Configuration Changes

### Update Next.js API Proxy (Already in Place)

File: `apps/web/src/app/api/[...path]/route.ts`

This already handles proxying to backend. Ensure:

```typescript
const base = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
```

This will use:
- `API_INTERNAL_URL` (server-side, internal Railway URL if available)
- `NEXT_PUBLIC_API_URL` (client-side, public API domain)

### Update CORS in Backend

File: `services/api/main.py`

Ensure CORS origins match your Vercel domain:

```python
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
# Should include: https://app.yourdomain.com, https://www.yourdomain.com
```

### Keep Cognito Configuration

No changes needed! Your Cognito setup is decoupled from infrastructure:
- User Pool ID: `us-east-1_NzlQEewnE`
- Client ID: `7mlaj0i1l97nq6e5p7h76llcoc`
- Domain: Cognito-hosted, region-based

---

## Part 6: Step-by-Step Implementation Checklist

### Phase 1: Preparation (No downtime)

- [ ] Create Railway account
- [ ] Create Vercel account
- [ ] Create `railway.json` in repo root
- [ ] Create `vercel.json` in repo root
- [ ] Update `apps/web/.env.local` for testing with Railway API

### Phase 2: Backend Migration (Staging First)

- [ ] Set up Railway project
- [ ] Add PostgreSQL to Railway (or use external RDS)
- [ ] Set all environment variables in Railway
- [ ] Deploy backend to Railway
- [ ] Run database migrations: `railway run alembic upgrade head`
- [ ] Test health endpoint: `curl https://<railway-api>.railway.app/health`
- [ ] Test API endpoints with test data

### Phase 3: Frontend Migration

- [ ] Push repo to GitHub (if not already)
- [ ] Import project in Vercel
- [ ] Set all environment variables in Vercel
- [ ] Set `NEXT_PUBLIC_API_URL` to Railway API URL
- [ ] Deploy and test login flow
- [ ] Test file uploads (if using S3, no changes; if local, verify endpoint)

### Phase 4: DNS & Custom Domains

- [ ] Update DNS to point to Vercel (for frontend)
- [ ] Update Cognito OAuth redirect URIs to new domain
- [ ] Add Railway custom domain (if needed for API)
- [ ] Test with real domain (not localhost)

### Phase 5: Cleanup (After verification)

- [ ] Disable AWS Amplify deployment
- [ ] Monitor Railway/Vercel logs for errors
- [ ] Schedule AWS CDK stack deletion (keep RDS snapshot if needed)
- [ ] Update documentation with new deployment instructions

---

## Part 7: Migration Gotchas & Important Notes

### 🔴 Critical Issues

1. **AWS Cognito JWKS Endpoint**
   - Currently fetching from `https://cognito-idp.${region}.amazonaws.com/${user_pool_id}/.well-known/jwks.json`
   - This works from anywhere, no changes needed
   - **Action:** Keep as-is

2. **OAuth Redirect URIs**
   - Cognito has hardcoded redirect URIs for security
   - **Action:** Update Cognito User Pool → App client → Hosted UI settings:
     - Add: `https://app.yourdomain.com/login`
     - Remove old Amplify URL if applicable

3. **Presigned URL Generation**
   - If keeping S3, boto3 works fine; just provide AWS credentials as env vars
   - If migrating away from S3, review Option B changes above
   - **Action:** Choose storage strategy early

4. **Database Migrations**
   - Railway startup will run migrations if `RUN_MIGRATIONS=1`
   - Alembic is already configured in `services/api/start.sh`
   - **Action:** Ensure `services/api/alembic/` is tracked in git

### ⚠️ Configuration Notes

1. **Local Uploads Mode**
   - If `LOCAL_UPLOADS=1`, files stored in `/app/uploads/` inside container
   - Files persist between deployments **only if** using Railway volumes
   - **Action:** Either enable Railway volumes or keep S3 for production

2. **S3 Bucket Permissions**
   - Current setup grants IAM role read/write to S3 bucket
   - For Railway, must use AWS credentials (not IAM role)
   - **Action:** Create IAM user with S3 permissions, use access key/secret

3. **Textract vs Pytesseract**
   - Textract: Better for scanned documents, requires S3 + AWS service
   - Pytesseract: Local processing, no AWS, requires tesseract system package (already in Dockerfile)
   - **Action:** Railway Dockerfile already has tesseract; just change `OCR_MODE=pytesseract`

4. **File Upload Bandwidth**
   - S3 presigned URLs: Direct browser-to-S3 upload (cheap)
   - Direct endpoint: Bandwidth through Railway (more expensive)
   - **Recommendation:** Keep S3 if you have high file volumes

### 🟡 Behavioral Changes

1. **Cold Starts**
   - Vercel: ~300-500ms for first request (normal for serverless)
   - Railway: ~100-200ms on restart (container-based, not serverless)
   - Impact: Minimal, but login flow may feel slightly slower

2. **File Storage**
   - S3 CDN: Fast global distribution
   - Railway volumes: Not CDN'd, slower for static files
   - **Recommendation:** Use Railway volumes for temporary files only; keep S3 for AR models/images

3. **Scaling**
   - AWS Fargate: Auto-scales on CPU (handled by CDK)
   - Railway: Auto-scales on CPU/memory (handled automatically)
   - Impact: Railway pricing may differ; monitor costs

---

## Part 8: Post-Migration Verification

### Checklist for Testing

```bash
# 1. API Health
curl https://<railway-api-url>/health
# Expected: {"status": "ok", "service": "menuvium-api"}

# 2. Database Connection
curl https://<railway-api-url>/organizations/
# Should require auth token, then return 401 or user data

# 3. Frontend Login
Visit https://app.yourdomain.com/login
# Should redirect to Cognito, then back to dashboard

# 4. File Upload
- Try uploading an item photo
- Check if file appears in S3 or Railway storage
- Verify URL is accessible

# 5. OCR Import
- Try importing a menu PDF
- Check OCR output (should be using pytesseract if local)

# 6. Monitor Logs
railway logs  # Watch for errors
vercel logs   # Watch for errors
```

---

## Part 9: Estimated Costs (Monthly)

### Current AWS (Rough)
- Fargate: $30-50/month
- RDS (t3.micro): $15-30/month
- S3: $1-5/month (based on usage)
- Cognito: Free tier covers most use cases
- **Total:** ~$50-85/month

### Railway Alternative
- Backend container: $7/month (starter plan) or pay-as-you-go
- PostgreSQL: $10-30/month (Railway managed)
- Networking: Included
- **Total:** ~$17-37/month (50% cheaper!)

### Vercel Alternative
- Frontend: $0/month (hobby plan, free tier) or $20/month (Pro)
- Bandwidth: Generous free tier, then $0.15/GB overage
- **Total:** $0-20/month

### Storage Comparison
- **Keep S3:** Continue AWS costs but use Railway/Vercel for compute
- **Switch to Railway Volumes:** Included in Railway plan (simpler billing)
- **Hybrid:** Use Railway for uploads, S3 for static assets (best performance)

---

## Part 10: Rollback Plan

If something goes wrong during migration:

1. **Keep AWS Stack Running** (at least 48 hours)
2. **Monitor Both Services** simultaneously
3. **Database:** Take RDS snapshot before cutover
4. **DNS:** Use weighted routing to gradually shift traffic:
   - Day 1-2: 90% old, 10% new
   - Day 3-4: 50% old, 50% new
   - Day 5+: 100% new (if stable)

---

## Files to Create/Modify

| File | Action | Priority |
|------|--------|----------|
| `railway.json` | Create | High |
| `vercel.json` | Create | High |
| `services/api/routers/items.py` | Modify (if no S3) | Medium |
| `services/api/routers/imports.py` | Modify (if no Textract) | Medium |
| `services/api/requirements.txt` | Modify (if no boto3) | Low |
| `apps/web/.env.example` | Update | Low |
| `docs/DEPLOYMENT.md` | Create (new docs) | Low |

---

## Next Steps

1. **Choose Storage Strategy** (S3 vs Local)
2. **Choose OCR Strategy** (Textract vs Pytesseract)
3. **Implement Code Changes** (if needed)
4. **Create Configuration Files** (railway.json, vercel.json)
5. **Set Up Railway Project** with environment variables
6. **Set Up Vercel Project** with environment variables
7. **Run Staged Deployment** (staging environment first)
8. **Verify All Features** (checklist above)
9. **Monitor Costs** and adjust as needed
10. **Decommission AWS** (after 1-2 weeks of stability)

---

**Questions or issues?** Review the specific files mentioned in this guide, or check Railway/Vercel documentation for latest changes.
