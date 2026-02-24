# 🚀 Menuvium Railway + Vercel Deployment - Detailed Step-by-Step Guide

**Last Updated:** February 23, 2026  
**Status:** Your code is pushed and ready to deploy

---

## 📋 Overview

You will:
1. Deploy **Backend API** to Railway (with PostgreSQL)
2. Deploy **Frontend** to Vercel
3. Connect everything together
4. Update Cognito settings
5. Test the full deployment

**Estimated Time:** 60-90 minutes  
**Cost:** $0-30/month (free tier eligible)

---

## Phase 1: Railway Backend Deployment (30-45 minutes)

### Step 1.1: Create Railway Account
**Goal:** Set up Railway account and connect to GitHub

1. Go to **https://railway.app**
2. Click **"Sign up"** (top right)
3. Choose **"Sign up with GitHub"**
4. Authorize Railway to access your GitHub
5. You'll be redirected to your Railway dashboard
6. Click **"New Project"** (top right)

### Step 1.2: Add PostgreSQL Database
**Goal:** Create database that will store your menu data

1. In new project, click **"Add Service"** (top right button)
2. Search for **"PostgreSQL"** in the marketplace
3. Click the PostgreSQL result
4. A PostgreSQL service will be added (takes ~30 seconds)
5. Once created, you'll see the service card showing:
   - Status (green checkmark)
   - Connection details

**📝 Note these down:**
- Click the PostgreSQL service card
- Look for **"Connect"** or the database icon
- You should see a `DATABASE_URL` variable (looks like `postgresql://...`)
- Copy this URL - you'll need it in Step 1.5

### Step 1.3: Connect Railway to Your GitHub Repository
**Goal:** Link your pushed code to Railway

1. In your Railway project, click **"Add Service"** again
2. This time, choose **"GitHub Repo"** (second option)
3. You'll see a prompt to authorize Railway on GitHub (if not already done)
4. Click **"Authorize"** and confirm
5. Now you'll see a list of your GitHub repositories
6. **Search for and select:** `menuvium` repository
7. Click **"Deploy"**

**This step:**
- Connects your GitHub repo to Railway
- Railway starts building your Docker image
- Status will show as "Building..." (takes 2-5 minutes)

### Step 1.4: Configure Root Directory
**Goal:** Tell Railway where your API code is located

1. After the repo is added, look for the service settings
2. Click on the GitHub repo service card
3. Go to **"Settings"** (gear icon, usually bottom right)
4. Under "Root Directory", enter: `services/api`
5. Click **"Save"**

**Why?** Your API code is in `services/api/`, not the repo root. This tells Railway where to find the Dockerfile.

### Step 1.5: Set Environment Variables
**Goal:** Configure API to connect to database and work properly

1. Still in the GitHub service settings (or click the service card)
2. Click **"Variables"** tab
3. Add the following variables:
   - Copy `DATABASE_URL` from PostgreSQL service (Step 1.2)
   - Click **"Add Variable"** and paste it

4. Then add these additional variables:

```
CORS_ORIGINS=https://your-domain.vercel.app,http://localhost:3000
LOCAL_UPLOADS=0
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=<your-cognito-pool-id>
COGNITO_CLIENT_ID=<your-cognito-client-id>
OPENAI_API_KEY=<your-openai-api-key>
OPENAI_MODEL=gpt-4o-mini
OCR_MODE=aws-textract
AR_WORKER_TOKEN=<generate-random-token>
RUN_MIGRATIONS=1
```

**Where to find these values:**
- `COGNITO_USER_POOL_ID`: AWS Console → Cognito → Your User Pool → General Settings (top) → Copy "User Pool ID"
- `COGNITO_CLIENT_ID`: Same location → App clients → Your app → "Client ID"
- `OPENAI_API_KEY`: From your OpenAI account (https://platform.openai.com/api-keys)
- `AR_WORKER_TOKEN`: Generate any random string (e.g., `super-secret-ar-worker-token-xyz123`)

⚠️ **Important:** 
- Don't use real values yet for `CORS_ORIGINS` - keep it as placeholder for now
- You'll update it after you get your Vercel domain (Step 2)

### Step 1.6: Verify Build and Deployment
**Goal:** Make sure your API deployed successfully

1. Go back to the project overview
2. Click on the GitHub service card
3. Look for **"Deployments"** or **"Build Log"**
4. You should see:
   - `Status: Success` (green)
   - Build finished in X minutes
5. Click on the GitHub service card to see the **generated domain**

**It will look like:**
```
https://menuvium-api-production.up.railway.app
```

📝 **Save this URL** - you'll need it for Vercel in Step 2

### Step 1.7: Test API Health
**Goal:** Verify the API is actually running

1. Open your browser and go to:
   ```
   https://[your-railway-api-url]/health
   ```
   (Replace `[your-railway-api-url]` with the domain from Step 1.6)

2. You should see:
   ```json
   {"status": "ok"}
   ```

3. Try the API docs page:
   ```
   https://[your-railway-api-url]/docs
   ```
   You should see Swagger UI with all endpoints listed

**If you get an error:**
- Check the Railway logs: Click service → "Logs" tab
- Common issues:
  - Database not ready yet (wait 30 seconds and try again)
  - Missing environment variables (check Step 1.5)
  - Dockerfile path wrong (check Step 1.4)

---

## Phase 2: Vercel Frontend Deployment (20-30 minutes)

### Step 2.1: Create Vercel Account
**Goal:** Set up Vercel account

1. Go to **https://vercel.com**
2. Click **"Sign Up"** (top right)
3. Choose **"Continue with GitHub"**
4. Authorize Vercel to access your GitHub
5. You'll be in your Vercel dashboard

### Step 2.2: Import Your Project
**Goal:** Connect your GitHub repository to Vercel

1. In Vercel dashboard, click **"Add New..."** (top left)
2. Choose **"Project"**
3. You'll see a list of your GitHub repos
4. **Search for and click** `menuvium`
5. Vercel will analyze the project

### Step 2.3: Configure Project Settings
**Goal:** Tell Vercel where your frontend code is and how to build it

After importing, you'll see configuration page:

1. **Framework Preset:** Should auto-detect **"Next.js"** (green checkmark)
   - If not, manually select it

2. **Root Directory:** Change to `apps/web`
   - Click "Edit" next to the default
   - Enter `apps/web`
   - Click "Confirm"

3. **Build and Output Settings:**
   - Build Command: `npm run build` (should be pre-filled)
   - Output Directory: `.next` (should be pre-filled)
   - Click "Confirm" if you make changes

### Step 2.4: Set Environment Variables
**Goal:** Configure frontend to connect to your Railway API

Still on the configuration page:

1. Scroll to **"Environment Variables"** section
2. Add these variables **one by one**:

```
NEXT_PUBLIC_API_URL=https://[your-railway-api-url]
API_INTERNAL_URL=https://[your-railway-api-url]
NEXT_PUBLIC_USER_POOL_ID=[your-cognito-pool-id]
NEXT_PUBLIC_USER_POOL_CLIENT_ID=[your-cognito-client-id]
NEXT_PUBLIC_COGNITO_DOMAIN=[your-cognito-domain].auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN=https://[your-vercel-domain].vercel.app/login
NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT=https://[your-vercel-domain].vercel.app/login
```

**For the URLs:**
- `[your-railway-api-url]` = from Step 1.6 (e.g., `menuvium-api-production.up.railway.app`)
- For Cognito values, use same as Step 1.5
- `[your-cognito-domain]` = Go to AWS Cognito → Domain name (or go to App clients → your app → "App domain")
- `[your-vercel-domain]` = You don't know this yet! Use placeholder like `menuvium-app`

**To add a variable:**
1. Click **"Add New"**
2. Enter the **key** (e.g., `NEXT_PUBLIC_API_URL`)
3. Enter the **value** (e.g., `https://menuvium-api-production.up.railway.app`)
4. Click **"Save"**
5. Repeat for all variables

⚠️ **Important:** For the Vercel domain variables, use your desired subdomain name as a placeholder. You'll update these after deployment if needed.

### Step 2.5: Deploy to Vercel
**Goal:** Build and deploy your frontend

1. Review all settings (should be green checkmarks)
2. Click **"Deploy"** button (bottom right)
3. Vercel will:
   - Install dependencies (npm install)
   - Build the project (npm run build)
   - Deploy to CDN
   - Takes 3-5 minutes

**Status page:**
- You'll see a deployment log
- Watch for "Build successful" message
- Then "Deployment complete"
- You'll get a **Vercel domain** like:
  ```
  https://menuvium-app-abc123.vercel.app
  ```

📝 **Save this domain** - you need it for the next steps

### Step 2.6: Test Frontend Deployment
**Goal:** Verify frontend loaded successfully

1. Click the **visit** button or go to your Vercel domain
2. You should see the Menuvium website load
3. Check the browser console (F12 → Console) for errors
4. **Don't test login yet** - we need to update Cognito settings first

**Common issues:**
- If you see API errors, check that `NEXT_PUBLIC_API_URL` is correct
- If Cognito UI doesn't load, check Cognito domain URL is correct

---

## Phase 3: Connect Everything (15-20 minutes)

### Step 3.1: Update Railway CORS Settings
**Goal:** Allow Vercel frontend to make requests to Railway API

1. Go back to Railway dashboard
2. Click on your **GitHub service** (API)
3. Click **"Variables"** tab
4. Find the variable: `CORS_ORIGINS`
5. **Edit it** to include your Vercel domain:
   ```
   https://[your-vercel-domain].vercel.app,https://menuvium-app-abc123.vercel.app,http://localhost:3000
   ```
   - Replace `[your-vercel-domain]` with your actual domain from Step 2.5
   - Include both the custom and vercel domain
   - Keep localhost for local development

6. Click **"Save"** or press Enter

### Step 3.2: Update Cognito Redirect URLs
**Goal:** Tell AWS Cognito your app domain so login works

1. Go to **AWS Console** → **Cognito**
2. Click on your **User Pool**
3. Click **"App clients"** (in left sidebar)
4. Click your app client (name you created)
5. Under **"Allowed redirect URIs"**, add:
   ```
   https://[your-vercel-domain].vercel.app/login
   https://menuvium-app-abc123.vercel.app/login
   http://localhost:3000/login
   ```
6. Under **"Allowed sign-out URIs"**, add the same URLs
7. Click **"Save"**

**Why?** Cognito only allows redirects to registered URLs for security.

### Step 3.3: Deploy Vercel with Updated Environment (Optional but Recommended)
**Goal:** Redeploy frontend if you want to be extra sure everything is wired up

1. Go to Vercel dashboard
2. Click your project
3. Go to **"Settings"** → **"Environment Variables"**
4. Update `NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN` and `NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT` with your actual Vercel domain
5. Go to **"Deployments"** tab
6. Click **"..."** on the latest deployment
7. Click **"Redeploy"**
8. Wait 2-3 minutes for redeploy to complete

---

## Phase 4: Testing (10-20 minutes)

### Step 4.1: Test User Login
**Goal:** Verify Cognito authentication works end-to-end

1. Go to your Vercel app: `https://[your-vercel-domain].vercel.app`
2. Click **"Login"** button
3. You should be redirected to Cognito login page
4. **Either:**
   - Sign up with a new email address, or
   - Use existing test credentials
5. After login, you should be redirected back to your app
6. Check that you're logged in (see your username/email)

**If login fails:**
- Check browser console (F12) for errors
- Check Cognito allowed redirect URLs (Step 3.2)
- Check Vercel environment variables are set correctly

### Step 4.2: Test API Connectivity
**Goal:** Verify frontend can talk to backend

1. Logged into your app, go to **"Dashboard"**
2. Try to **view/create a menu**
3. Watch the Network tab (F12 → Network)
4. You should see API requests to your Railway API domain
5. Check for 200 status codes (success)

**If API calls fail:**
- Check Railway logs for errors (Railway dashboard → service → Logs)
- Check CORS settings in Step 3.1
- Check that DATABASE_URL is correct in Railway

### Step 4.3: Test File Upload
**Goal:** Verify file uploads work

1. In dashboard, **edit a menu**
2. Click **"Choose image"** and upload a photo
3. Verify it appears in the UI
4. Refresh the page - image should still be there

**Success indicators:**
- Image displays in UI
- No console errors
- API logs show successful upload

### Step 4.4: Test AR Video Upload (Optional)
**Goal:** Verify AR video upload endpoint works

1. Edit a menu item
2. Scroll to **"AR Model"** section
3. Click **"Choose video"** and select any video file
4. Click **"Upload & generate"**
5. Status should change to **"Queued"** or **"Pending"**

**Note:** Actual AR processing won't happen until you set up the macOS worker. But the upload and queuing should work.

---

## ✅ Success Checklist

After deployment, you should be able to:

- [ ] API health endpoint returns `{"status": "ok"}`
- [ ] Frontend loads without errors
- [ ] Can log in with Cognito
- [ ] Can create and edit menus
- [ ] Can upload images
- [ ] Dashboard shows your menus
- [ ] Browser network tab shows successful API calls

---

## 🆘 Troubleshooting

### "Cannot connect to database"
**Solution:**
1. Check Railway PostgreSQL service is running (green checkmark)
2. Verify `DATABASE_URL` environment variable is copied exactly
3. Check Railway API service logs for connection errors
4. Wait 30 seconds and restart the service (Railway → service card → Restart)

### "CORS error: Access-Control-Allow-Origin missing"
**Solution:**
1. Check `CORS_ORIGINS` variable in Railway (Step 3.1)
2. Make sure your Vercel domain is included
3. Redeploy Railway service after changing (scroll down, click Redeploy)
4. Wait 1-2 minutes for new deployment

### "Login redirects to wrong URL"
**Solution:**
1. Check Cognito allowed redirect URIs (Step 3.2) - must match exactly
2. Check Vercel environment variables `NEXT_PUBLIC_AUTH_REDIRECT_*`
3. Clear browser cache/cookies and try again

### "Images don't display"
**Solution:**
1. Check S3 bucket exists and is public (or using local uploads)
2. Verify `S3_BUCKET_NAME` in Railway environment
3. Check AWS credentials have S3 access
4. Verify image URL in database is correct

### Build fails on Vercel
**Solution:**
1. Check build logs in Vercel dashboard
2. Common issues:
   - Missing environment variables
   - Node version mismatch
   - TypeScript errors
3. Click "Redeploy" after fixing issues

### API endpoints return 404
**Solution:**
1. Check Railway API logs
2. Verify migrations ran (look for "Running migrations..." in logs)
3. Restart Railway service
4. Check Dockerfile path is correct (should be `services/api/Dockerfile`)

---

## 📞 Next Steps After Successful Deployment

1. **Optional: Set up custom domain**
   - Vercel: Add custom domain in Settings → Domains
   - Point DNS to Vercel nameservers

2. **Optional: Set up AR worker**
   - Follow `services/ar-worker-mac/README.md`
   - Run macOS worker to process AR videos

3. **Monitor costs**
   - Check Railway dashboard monthly billing
   - Check Vercel analytics

4. **Set up monitoring**
   - Enable logs in Railway and Vercel
   - Set up error tracking (e.g., Sentry)

---

## 📊 Expected Monthly Costs

| Service | Cost |
|---------|------|
| Railway API | $7-20 |
| Railway PostgreSQL | $10-30 |
| Vercel (free) | $0-20 |
| **Total** | **$17-70** |

(AWS Cognito and S3 are billed separately; costs depend on usage)

---

## 🎉 You're Done!

Your Menuvium app is now live on:
- **Frontend:** `https://[your-vercel-domain].vercel.app`
- **API:** `https://[your-railway-api-domain].up.railway.app`
- **API Docs:** `https://[your-railway-api-domain].up.railway.app/docs`

Celebrate! 🚀

---

**Questions?** Check the Railway and Vercel documentation, or review the RAILWAY_SETUP.md and VERCEL_SETUP.md files in your repo.
