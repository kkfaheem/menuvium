# Optional Code Changes for AWS-to-Railway Migration

**This document outlines optional code changes if you want to migrate away from AWS S3 and Textract.**

---

## Decision Matrix

| Feature | Keep AWS S3 | Migrate to Local/DB |
|---------|------------|-------------------|
| **File Upload** | Uses presigned URLs | Direct upload endpoint |
| **OCR** | AWS Textract | Local pytesseract |
| **Code Changes** | None (just update env vars) | Required (see below) |
| **Performance** | Excellent (CDN) | Good (Railway volumes) |
| **Cost** | Separate AWS account | Included in Railway |
| **Setup Complexity** | High (IAM + bucket) | Low (just env var) |
| **Recommendation** | For production | For MVP/small scale |

---

## Option 1: Keep AWS S3 (Recommended for Production)

### What to do:
1. Keep all code as-is
2. Set these environment variables in Railway:
   ```
   S3_BUCKET_NAME=menuvium-ar-models
   AWS_ACCESS_KEY_ID=YOUR-KEY
   AWS_SECRET_ACCESS_KEY=YOUR-SECRET
   OCR_MODE=textract
   ```
3. Deploy and test

### IAM Policy to Create:

Create an IAM user in AWS console with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::menuvium-ar-models",
        "arn:aws:s3:::menuvium-ar-models/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "textract:DetectDocumentText",
        "textract:GetDocumentTextDetection"
      ],
      "Resource": "*"
    }
  ]
}
```

Then use that user's access key/secret in Railway.

---

## Option 2: Migrate Away from S3 (DIY Storage)

**Only do this if you want full independence from AWS.**

### Step 1: Update `services/api/routers/items.py`

Replace lines 80-114 (presigned URL generation):

**OLD CODE:**
```python
@router.post("/upload-url", response_model=PresignedUrlResponse)
def generate_upload_url(req: PresignedUrlRequest, request: Request, user: dict = UserDep):
    bucket_name = os.getenv("S3_BUCKET_NAME")
    if not bucket_name:
        if _local_uploads_enabled():
            key = f"items/{uuid.uuid4()}-{os.path.basename(req.filename)}"
            prefix = forwarded_prefix(request)
            base = prefix or ""
            return {
                "upload_url": f"{base}/items/local-upload/{key}",
                "s3_key": key,
                "public_url": f"{base}/uploads/{key}",
            }
        raise HTTPException(status_code=500, detail="S3 configuration missing")

    s3_client = boto3.client('s3')
    key = f"items/{uuid.uuid4()}-{req.filename}"
    
    response = s3_client.generate_presigned_url('put_object',
                                                Params={'Bucket': bucket_name, 'Key': key},
                                                ExpiresIn=3600)
    
    return {
        "upload_url": response,
        "s3_key": key,
        "public_url": f"https://{bucket_name}.s3.amazonaws.com/{key}"
    }
```

**NEW CODE (direct upload endpoint):**

```python
import hmac
import hashlib
from datetime import datetime, timedelta

@router.post("/upload-url", response_model=PresignedUrlResponse)
def generate_upload_url(req: PresignedUrlRequest, request: Request, user: dict = UserDep):
    """Generate upload URL with a signed token instead of presigned S3 URL."""
    key = f"items/{uuid.uuid4()}-{req.filename}"
    token = _generate_upload_token(key, user["sub"])
    
    prefix = forwarded_prefix(request)
    base_url = prefix or ""
    
    return {
        "upload_url": f"{base_url}/items/direct-upload",
        "s3_key": key,
        "public_url": f"{base_url}/uploads/{key}",
    }

def _generate_upload_token(key: str, user_id: str) -> str:
    """Generate a signed, time-limited upload token."""
    secret = os.getenv("UPLOAD_SECRET", "change-me-in-production")
    expiry = (datetime.utcnow() + timedelta(hours=1)).isoformat()
    
    # Create signature
    data = f"{key}:{user_id}:{expiry}".encode()
    sig = hmac.new(secret.encode(), data, hashlib.sha256).hexdigest()
    
    return f"{key}:{user_id}:{expiry}:{sig}"

def _verify_upload_token(token: str) -> tuple[str, str]:
    """Verify and extract key and user_id from token."""
    try:
        parts = token.rsplit(":", 3)
        if len(parts) != 4:
            raise ValueError("Invalid token format")
        
        key, user_id, expiry, sig = parts
        
        # Verify signature
        secret = os.getenv("UPLOAD_SECRET", "change-me-in-production")
        expected_sig = hmac.new(
            secret.encode(),
            f"{key}:{user_id}:{expiry}".encode(),
            hashlib.sha256
        ).hexdigest()
        
        if sig != expected_sig:
            raise ValueError("Invalid signature")
        
        # Verify expiry
        if datetime.fromisoformat(expiry) < datetime.utcnow():
            raise ValueError("Token expired")
        
        return key, user_id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid upload token: {e}")

@router.post("/items/direct-upload")
async def direct_upload(file: UploadFile, token: str = Query(...)):
    """Handle direct file upload with token verification."""
    key, user_id = _verify_upload_token(token)
    
    try:
        content = await file.read()
        
        # Store locally (Railway volumes) or in database
        if _local_uploads_enabled():
            target_path = _local_upload_dir() / key
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(content)
        else:
            # Fallback to S3 if LOCAL_UPLOADS not enabled
            s3 = boto3.client("s3")
            s3.put_object(
                Bucket=os.getenv("S3_BUCKET_NAME"),
                Key=key,
                Body=content,
                ContentType=file.content_type
            )
        
        return {"status": "ok", "key": key, "size": len(content)}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
```

### Step 2: Update `services/api/routers/imports.py` (OCR)

Replace AWS Textract calls:

**OLD CODE:**
```python
def _ocr_with_textract(file: UploadFile) -> str:
    bucket = os.getenv("S3_BUCKET_NAME")
    if not bucket:
        raise HTTPException(status_code=500, detail="S3_BUCKET_NAME is required for Textract OCR")
    
    s3 = boto3.client("s3")
    textract = boto3.client("textract")
    key = f"ocr-temp/{uuid.uuid4()}.pdf"
    
    s3.upload_fileobj(file.file, bucket, key, ExtraArgs={"ContentType": file.content_type})
    response = textract.detect_document_text(
        Document={"S3Object": {"Bucket": bucket, "Name": key}}
    )
    
    text = ""
    for block in response["Blocks"]:
        if block["BlockType"] == "LINE":
            text += block["Text"] + "\n"
    
    return text.strip()
```

**NEW CODE (pytesseract only):**

```python
def _ocr_with_pytesseract(file: UploadFile) -> str:
    """Use local pytesseract (no AWS Textract)."""
    try:
        from PIL import Image
        import pytesseract
        import pdfplumber
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"OCR dependencies not installed: {e}"
        )
    
    content = file.file.read()
    
    # Handle PDFs
    if file.content_type == "application/pdf":
        text_parts: List[str] = []
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for page in pdf.pages:
                    # Convert PDF page to image
                    image = page.convert_image(fmt="ppm")
                    # Extract text using pytesseract
                    page_text = pytesseract.image_to_string(image)
                    if page_text.strip():
                        text_parts.append(page_text)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"PDF processing failed: {e}"
            )
        return "\n".join(text_parts).strip()
    
    # Handle images (JPG, PNG, etc.)
    try:
        image = Image.open(io.BytesIO(content)).convert("RGB")
        return pytesseract.image_to_string(image).strip()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Image OCR failed: {e}"
        )

# Update the import endpoints (around line 182 and 209):
# OLD:
# if ocr_mode == "textract":
#     text = _ocr_with_textract(file)

# NEW:
if ocr_mode == "textract":
    # If textract requested but not available, fall back
    try:
        text = _ocr_with_textract(file)  # Keep for backward compat
    except:
        text = _ocr_with_pytesseract(file)
elif ocr_mode == "pytesseract":
    text = _ocr_with_pytesseract(file)
```

### Step 3: Remove boto3 from requirements (if not using S3)

**services/api/requirements.txt:**

```diff
  fastapi
  uvicorn[standard]
  sqlmodel
  psycopg2-binary
  alembic
  pydantic-settings
  python-multipart
  python-jose[cryptography]
  cryptography
  httpx
  requests
  pytest
- boto3
  asyncpg
  openai
  pytesseract
  pillow
  pdfplumber
  beautifulsoup4
```

### Step 4: Update Environment Variables

**services/api/start.sh** (no changes needed - already handles migrations)

**Set in Railway:**

```bash
# Use local uploads instead of S3
LOCAL_UPLOADS=1
UPLOAD_SECRET=your-super-secret-random-string-here

# Use pytesseract for OCR
OCR_MODE=pytesseract

# No longer need:
# S3_BUCKET_NAME
# AWS_ACCESS_KEY_ID
# AWS_SECRET_ACCESS_KEY
```

---

## Step 5: Frontend Updates (Optional)

If moving away from S3 presigned URLs, the frontend code already supports direct upload via `/items/direct-upload` endpoint.

**No changes needed** - frontend already has fallback logic for direct uploads.

---

## Step 6: Handle Existing S3 Files

After migration, existing files in S3 still need to be accessible.

### Option A: Keep S3 as Read-Only
```python
@router.get("/uploads/{path}")
def get_upload(path: str):
    """Redirect to S3 for existing files, serve local for new ones."""
    if os.path.exists(_local_upload_dir() / path):
        # Serve local file
        return FileResponse(_local_upload_dir() / path)
    else:
        # Redirect to S3
        return RedirectResponse(url=f"https://menuvium-ar-models.s3.amazonaws.com/{path}")
```

### Option B: Migrate S3 Files to Railway
```bash
# Download all S3 files
aws s3 sync s3://menuvium-ar-models ./services/api/uploads/

# Commit to git (if small) or upload to Railway volumes
```

---

## Testing Before Production

### Test Checklist:

```bash
# 1. Start local development
cd services/api
python -m uvicorn main:app --reload

# 2. Test file upload
curl -X POST "http://localhost:8000/items/upload-url" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.jpg","content_type":"image/jpeg"}'

# Expected response:
# {"upload_url":"http://localhost:8000/items/direct-upload","s3_key":"items/...","public_url":"http://localhost:8000/uploads/items/..."}

# 3. Test direct upload
curl -X POST "http://localhost:8000/items/direct-upload?token=YOUR_TOKEN" \
  -F "file=@test.jpg"

# 4. Verify file exists
ls services/api/uploads/items/
# Should see your file

# 5. Test OCR
curl -X POST "http://localhost:8000/imports/pdf-to-menu/YOUR_MENU_ID" \
  -F "file=@sample.pdf"

# 6. Check logs for errors
# Should see OCR processing via pytesseract, not AWS
```

---

## Rollback to S3

If something goes wrong with local storage:

```bash
# Restore S3 usage
railway variables set S3_BUCKET_NAME="menuvium-ar-models"
railway variables set OCR_MODE="textract"
railway variables set LOCAL_UPLOADS="0"

# Redeploy
railway up
```

---

## Performance Considerations

### Local Storage (Railway)

**Pros:**
- Simple setup
- No AWS costs
- Direct control

**Cons:**
- Files only in one region
- No CDN
- Slower for large files

### S3 (Keep as-is)

**Pros:**
- Global distribution
- Fast downloads
- Proven reliability

**Cons:**
- AWS costs
- IAM complexity
- Separate account management

**Recommendation:** For production, keep S3 unless you have very small file volumes.

---

## Size Limitations

### Local Storage
- Max file size: Limited by Railway disk space (~100GB total)
- Should enable Railway volumes for persistence
- Use S3 for files >100MB

### S3
- Unlimited (AWS limits are very high)
- Better for large AR models

---

## Summary

| Change | Effort | Complexity | Recommended |
|--------|--------|-----------|------------|
| Keep S3 (no code changes) | 0% | Low | ✅ Yes |
| Switch to local storage | 30% | Medium | For MVP |
| Switch OCR to pytesseract | 15% | Low | Both options |
| Full independence (no AWS) | 45% | High | Only if needed |

**Recommendation:** Start with keeping S3 (no code changes). Migrate later if AWS costs become a problem.
