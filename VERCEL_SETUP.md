# Vercel Deployment Setup

## Step-by-Step Guide

### 1. Create Vercel Account
- Go to [vercel.com](https://vercel.com)
- Sign up with GitHub
- Import your menuvium repository

### 2. Configure Project

During import, Vercel should auto-detect Next.js:

**Root Directory**: `./apps/web`

**Build Settings**:
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`

### 3. Environment Variables

Before deploying, add these in Vercel dashboard (Project Settings → Environment Variables):

```
NEXT_PUBLIC_API_URL=https://your-railway-api-domain.up.railway.app
API_INTERNAL_URL=https://your-railway-api-domain.up.railway.app
NEXT_PUBLIC_USER_POOL_ID=<your-cognito-pool-id>
NEXT_PUBLIC_USER_POOL_CLIENT_ID=<your-cognito-client-id>
NEXT_PUBLIC_COGNITO_DOMAIN=<your-cognito-domain>.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN=https://your-vercel-domain.vercel.app/login
NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT=https://your-vercel-domain.vercel.app/login
```

### 4. Deploy

1. Click "Deploy"
2. Vercel builds and deploys automatically
3. Get your domain (example: `menuvium-app.vercel.app`)

### 5. Update Cognito Redirect URLs

Go to AWS Cognito → Your User Pool → App Client → Allowed Redirect URLs:

Add:
- `https://your-vercel-domain.vercel.app/login`

### 6. Test

- Visit `https://your-vercel-domain.vercel.app`
- Try login (will redirect to Cognito)
- Check browser DevTools → Network to verify API calls to Railway

## Auto-Deploy

Whenever you push to main branch:
1. Vercel automatically builds and deploys
2. Check deployment status in Vercel dashboard
3. Previous deployments are archived (rollback available)

## Custom Domain (Optional)

In Vercel → Settings → Domains:
- Add your custom domain
- Update DNS records (Vercel shows exact steps)
- Update Cognito redirect URLs to custom domain

## Troubleshooting

**Build fails?**
- Check Node version matches `apps/web/package.json`
- Verify all dependencies in `package.json` are correct
- Check build logs in Vercel dashboard

**API calls fail?**
- Confirm `NEXT_PUBLIC_API_URL` env var is set
- Verify Railway API is running and responding
- Check browser console for CORS errors

**Login redirects to wrong URL?**
- Update `NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN/OUT` env vars
- Update AWS Cognito allowed redirect URLs
- Clear browser cache and try again

## Performance Tips

- Vercel includes built-in CDN (your frontend is globally cached)
- Next.js Image optimization is automatic
- Deploy preview URLs are created for each PR (for testing)
