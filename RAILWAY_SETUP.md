# Railway Deployment Setup

## Quick Start

### 1. Create Railway Account
- Go to [railway.app](https://railway.app)
- Sign up with GitHub
- Create new project

### 2. Add Services

#### PostgreSQL Database
1. Click "Add Service" → "PostgreSQL"
2. Railway generates connection string automatically
3. Note the `DATABASE_URL`

#### API (FastAPI)
1. Click "Add Service" → "GitHub Repo"
2. Select your menuvium repository
3. Choose `/services/api` as root directory
4. Set environment variables (see below)

### 3. Environment Variables for API
Add these in Railway dashboard (API service settings):

```
DATABASE_URL=<from PostgreSQL service>
CORS_ORIGINS=http://localhost:3000,https://your-vercel-domain.vercel.app
LOCAL_UPLOADS=0
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=<your-cognito-pool-id>
COGNITO_CLIENT_ID=<your-cognito-client-id>
OPENAI_API_KEY=<your-key>
OPENAI_MODEL=gpt-4o-mini
OCR_MODE=aws-textract
AR_WORKER_TOKEN=<generate-random-token>
```

### 4. Deploy
- Railway auto-deploys on git push
- Check logs in Railway dashboard
- Test API health: `https://your-railway-url/health`

## Troubleshooting

**Build fails?**
- Check `services/api/Dockerfile` is correct
- Verify `requirements.txt` has all dependencies

**Database connection error?**
- Copy exact `DATABASE_URL` from PostgreSQL service
- Check it's set in API service environment

**Port issues?**
- Railway assigns a random port, exposes it via domain
- Check "View Logs" in dashboard for port assignment

## Domain
Railway provides a free domain: `project-name.up.railway.app`

Once deployed, update your Vercel frontend's `NEXT_PUBLIC_API_URL` to point here.
