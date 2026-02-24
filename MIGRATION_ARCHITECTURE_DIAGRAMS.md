# Migration Architecture Diagrams

## Current Architecture (AWS CDK)

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS INFRASTRUCTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      Internet / Users                     │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│                    ┌───────────────┐                            │
│                    │   Route 53    │ (DNS)                      │
│                    └───────┬───────┘                            │
│                            │                                     │
│          ┌─────────────────┼─────────────────┐                 │
│          ▼                 ▼                 ▼                 │
│    ┌──────────┐      ┌──────────┐      ┌──────────┐           │
│    │ Amplify  │      │CloudFront│      │   ALB    │           │
│    │ Frontend │      │   CDN    │      │ (Fargate)│           │
│    └──────────┘      └────┬─────┘      └────┬─────┘           │
│                           │                 │                  │
│                           └────────┬────────┘                  │
│                                    ▼                           │
│                            ┌──────────────┐                    │
│                            │    ECR +     │                    │
│                            │   Fargate    │ (Backend API)     │
│                            │   FastAPI    │                    │
│                            └──────┬───────┘                    │
│                                   │                            │
│                ┌──────────────────┼──────────────────┐         │
│                │                  │                  │         │
│                ▼                  ▼                  ▼         │
│           ┌─────────┐         ┌────────┐       ┌─────────┐    │
│           │   RDS   │         │ S3     │       │ Cognito │    │
│           │PostgreSQL          │ Uploads│        │ Auth    │   │
│           └─────────┘         └────────┘       └─────────┘    │
│                                   │                            │
│                              ┌────▼────┐                       │
│                              │Textract │ (OCR)                │
│                              └─────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Target Architecture (Railway + Vercel)

### Strategy 1: Keep S3 (Recommended)

```
┌─────────────────────────────────────────────────────────────────┐
│                     RAILWAY + VERCEL SETUP                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      Internet / Users                     │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│                    ┌───────────────┐                            │
│                    │   Your DNS    │                            │
│                    │ yourdomain.com│                            │
│                    └───────┬───────┘                            │
│                            │                                     │
│          ┌─────────────────┼─────────────────┐                 │
│          │                 │                 │                 │
│          ▼                 ▼                 ▼                 │
│    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│    │   Vercel     │  │   Vercel     │  │   Railway    │       │
│    │   Frontend   │  │   API Proxy  │  │   Backend    │       │
│    │   (Next.js)  │  │ (optional)   │  │   (FastAPI)  │       │
│    └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│           │                 │                 │               │
│           └─────────────────┼─────────────────┘               │
│                             │                                 │
│                      ┌──────▼─────────┐                       │
│                      │  Railway API   │                       │
│                      │    Container   │                       │
│                      └──────┬─────────┘                       │
│                             │                                 │
│           ┌─────────────────┼─────────────────┐              │
│           │                 │                 │              │
│           ▼                 ▼                 ▼              │
│      ┌─────────┐        ┌────────┐      ┌─────────┐         │
│      │ Railway │        │ S3     │      │Cognito  │         │
│      │ PostgreSQL        │Uploads│       │Auth     │         │
│      └─────────┘        └────────┘      └─────────┘         │
│           ▲                   │                              │
│           │                   │                              │
│           └───────────────┬───┘                              │
│                           │                                 │
│                      ┌────▼────┐                            │
│                      │Textract │ (OCR)                     │
│                      └─────────┘                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### Strategy 3: Full Independence (No AWS)

```
┌─────────────────────────────────────────────────────────────────┐
│                RAILWAY + VERCEL (FULL INDEPENDENCE)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      Internet / Users                     │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│                    ┌───────────────┐                            │
│                    │   Your DNS    │                            │
│                    │ yourdomain.com│                            │
│                    └───────┬───────┘                            │
│                            │                                     │
│          ┌─────────────────┼─────────────────┐                 │
│          │                 │                 │                 │
│          ▼                 ▼                 ▼                 │
│    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│    │   Vercel     │  │   Vercel     │  │   Railway    │       │
│    │   Frontend   │  │   API Proxy  │  │   Backend    │       │
│    │   (Next.js)  │  │   (optional) │  │   (FastAPI)  │       │
│    └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│           │                 │                 │               │
│           └─────────────────┼─────────────────┘               │
│                             │                                 │
│                      ┌──────▼─────────┐                       │
│                      │  Railway API   │                       │
│                      │    Container   │                       │
│                      └──────┬─────────┘                       │
│                             │                                 │
│           ┌─────────────────┼─────────────────┐              │
│           │                 │                 │              │
│           ▼                 ▼                 ▼              │
│      ┌─────────┐       ┌─────────┐    ┌─────────┐          │
│      │ Railway │       │ Railway │    │Cognito  │          │
│      │PostgreSQL        │ Volumes │     │Auth     │          │
│      └─────────┘       │ Storage │    └─────────┘          │
│                        └─────────┘                           │
│                             │                                │
│                      ┌──────▼──────┐                         │
│                      │ Pytesseract │ (Local OCR)           │
│                      │ (Container) │                         │
│                      └─────────────┘                         │
│                                                               │
│    ✅ No AWS dependencies                                      │
│    ✅ All in Railway/Vercel                                   │
│    ✅ Lowest costs ($17-25/month)                            │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Migration Flow Diagram

```
        ┌─────────────────────────────────┐
        │  CURRENT STATE (AWS CDK)         │
        │  ├─ Amplify (Frontend)           │
        │  ├─ Fargate (Backend)            │
        │  ├─ RDS (Database)               │
        │  ├─ S3 (Storage)                 │
        │  ├─ Cognito (Auth)               │
        │  └─ Textract (OCR)               │
        └──────────────┬──────────────────┘
                       │
                       ▼
     ┌─────────────────────────────────────┐
     │  STRATEGY DECISION                  │
     │  ┌─ Strategy 1: Keep S3 (no code)   │
     │  ├─ Strategy 2: Local + S3 (code)   │
     │  └─ Strategy 3: Full independence   │
     └──────────────┬──────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
    ┌──────┐   ┌──────┐   ┌──────┐
    │Strat1│   │Strat2│   │Strat3│
    │(Easy)│   │(Med) │   │(Hard)│
    └───┬──┘   └───┬──┘   └───┬──┘
        │          │          │
        └──────────┼──────────┘
                   ▼
       ┌───────────────────────────┐
       │ Create Railway Project     │
       │ ├─ Add PostgreSQL          │
       │ └─ Set Env Variables       │
       └───────────┬───────────────┘
                   │
                   ▼
       ┌───────────────────────────┐
       │ Deploy Backend to Railway │
       │ ├─ railway up             │
       │ └─ Verify logs            │
       └───────────┬───────────────┘
                   │
                   ▼
       ┌───────────────────────────┐
       │ Create Vercel Project     │
       │ ├─ Link GitHub repo       │
       │ └─ Set Env Variables      │
       └───────────┬───────────────┘
                   │
                   ▼
       ┌───────────────────────────┐
       │ Deploy Frontend to Vercel │
       │ ├─ vercel deploy --prod   │
       │ └─ Verify build           │
       └───────────┬───────────────┘
                   │
                   ▼
       ┌───────────────────────────┐
       │ Update DNS & Cognito      │
       │ ├─ Add CNAME records      │
       │ └─ Update callback URLs   │
       └───────────┬───────────────┘
                   │
                   ▼
       ┌───────────────────────────┐
       │ Test & Verify             │
       │ ├─ Login flow works       │
       │ ├─ API connectivity OK    │
       │ └─ File uploads work      │
       └───────────┬───────────────┘
                   │
                   ▼
       ┌───────────────────────────┐
       │ Monitor (1-2 weeks)       │
       │ ├─ Keep AWS as backup     │
       │ └─ Watch logs & costs     │
       └───────────┬───────────────┘
                   │
                   ▼
       ┌───────────────────────────┐
       │ PRODUCTION (Railway+Vercel)│
       │ ├─ AWS can be deleted     │
       │ ├─ 40-50% cost savings    │
       │ └─ Fully migrated!        │
       └───────────────────────────┘
```

---

## Data Flow: File Upload

### Current (AWS S3 Presigned URLs)

```
User Browser
    │
    ├─ Request upload URL ──────────────────┐
    │                                       │
    ▼                                       ▼
API (Fargate)                          S3 Console
    │
    ├─ Generate presigned URL ──────────────┐
    │                                       │
    ▼                                       ▼
    └─ Return to browser                AWS S3
        │
        ├─ PUT file directly to S3 ─────────┐
        │                                  │
        ▼                                  ▼
    Database (RDS)                     S3 Bucket
        │
        └─ Store metadata (s3_key, url)
```

### After Migration (Strategy 1: Keep S3)

```
User Browser
    │
    ├─ Request upload URL ──────────────────┐
    │                                       │
    ▼                                       ▼
API (Railway)                           S3 Console
    │
    ├─ Generate presigned URL ──────────────┐
    │                                       │
    ▼                                       ▼
    └─ Return to browser                AWS S3
        │
        ├─ PUT file directly to S3 ─────────┐
        │                                  │
        ▼                                  ▼
    Database (Railway)                  S3 Bucket
        │
        └─ Store metadata (s3_key, url)
```

### After Migration (Strategy 3: Full Independence)

```
User Browser
    │
    ├─ Request upload URL ──────────────────┐
    │                                       │
    ▼                                       ▼
API (Railway)                           
    │
    ├─ Generate upload token ────────────┐
    │                                    │
    ▼                                    ▼
    └─ Return direct upload URL
        │
        ├─ POST file to /items/direct-upload with token
        │
        ▼
    API (Railway)
        │
        ├─ Verify token
        │
        ▼
    Database (Railway)
        │
        ├─ Store file ──────────────┐
        │                           │
        ▼                           ▼
    Railway Volumes          Database
        │                       │
        └─ File stored          └─ Metadata
            (persistent)
```

---

## Cost Comparison Over Time

```
Monthly Cost ($)
│
100 ├─ AWS (Current)
    │  ┌─────────────────────────────────
80  ├─ │                                  
    │  │                                  
60  ├─ │                                  
    │  │   Railway + S3              
40  ├─ │  ┌──────────────────────────────
    │  │  │                             
20  ├─ │  │   Railway Only             
    │  │  │  ┌──────────────────────────
0   └──┴──┴──┴─────────────────────────────
    0  1  2  3  4  5  6  12  24  months

Cumulative Savings:
├─ Month 1-3:  $100-200 savings
├─ Month 6:    $400-500 savings
└─ Year 1:     $500-800 savings
```

---

## Environment Variable Flow

```
┌─────────────────────────────────────────────────────┐
│           ENVIRONMENT VARIABLES                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Railway Backend ◄─── Set in Railway Dashboard     │
│  ├─ DATABASE_URL                                   │
│  ├─ COGNITO_USER_POOL_ID                           │
│  ├─ COGNITO_CLIENT_ID                              │
│  ├─ OPENAI_API_KEY                                 │
│  ├─ S3_BUCKET_NAME (if Strategy 1)                │
│  └─ AWS_CREDENTIALS (if using S3)                 │
│                                                      │
│  Vercel Frontend ◄─── Set in Vercel Dashboard      │
│  ├─ NEXT_PUBLIC_USER_POOL_ID                       │
│  ├─ NEXT_PUBLIC_USER_POOL_CLIENT_ID                │
│  ├─ NEXT_PUBLIC_COGNITO_DOMAIN                     │
│  ├─ NEXT_PUBLIC_API_URL                            │
│  ├─ NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN               │
│  └─ NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT              │
│                                                      │
│  AWS Cognito ◄─── Manually configure in Console    │
│  ├─ Callback URLs                                  │
│  └─ Sign-out URLs                                  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Rollback Plan Diagram

```
Everything Works? ────┐
                      │
                      NO ▼
                    ┌──────────────────┐
                    │ Check Logs       │
                    │ Identify Issue   │
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
         FIX CODE              QUICK ROLLBACK
              │                    │
              ▼                    ▼
         ┌─────────┐         ┌──────────────┐
         │ Redeploy│         │ Update DNS   │
         │ Railway │         │ Back to AWS  │
         └────┬────┘         │ (5-10 min)   │
              │              └──────┬───────┘
              ▼                     ▼
         ┌─────────┐         ┌──────────────┐
         │  Test   │         │ Verify AWS   │
         │ Again   │         │ Works        │
         └────┬────┘         └──────┬───────┘
              │                     │
              └─────────┬───────────┘
                        │
                        ▼
                 ┌─────────────┐
                 │ Everything  │
                 │ OK? YES!    │
                 └─────────────┘
```

---

## Technology Stack Comparison

### Current (AWS CDK)
```
Frontend:     Amplify + Next.js + Cognito
Backend:      Fargate + FastAPI + Python
Database:     RDS PostgreSQL
Storage:      S3 + CloudFront
Authentication: Cognito
OCR:          AWS Textract
Monitoring:   CloudWatch
Cost Control: Manual scaling
```

### After Migration (Railway + Vercel)
```
Frontend:     Vercel + Next.js + Cognito
Backend:      Railway + FastAPI + Python
Database:     Railway PostgreSQL (or external RDS)
Storage:      S3 (kept) + Railway Volumes (optional)
Authentication: Cognito (unchanged)
OCR:          Textract (kept) or Pytesseract (local)
Monitoring:   Railway + Vercel dashboards
Cost Control: Auto-scaling included
```

---

**Key Insight:** The migration is primarily about changing **where** your code runs, not **what** code runs. Most infrastructure logic remains the same.
