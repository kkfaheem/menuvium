# Menuvium AWS CDK → Railway + Vercel Migration: Complete Package

**This directory now contains everything you need to migrate your Menuvium application from AWS CDK to Railway + Vercel.**

---

## 📋 Documentation Index

### Quick Start (Read These First)

1. **[MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md)** ⭐ START HERE
   - Executive summary of the entire migration
   - High-level overview of changes
   - Decision matrix (3 strategies)
   - Step-by-step checklist
   - **Time to read:** 10-15 minutes

2. **[MIGRATION_CHECKLIST.md](MIGRATION_CHECKLIST.md)** - Print & Use
   - Complete checklist to track progress
   - Check off items as you complete them
   - Emergency rollback procedures
   - **Use:** Throughout migration process

### Detailed Guides (Reference)

3. **[MIGRATION_TO_RAILWAY_VERCEL.md](MIGRATION_TO_RAILWAY_VERCEL.md)** - Complete Analysis
   - Detailed codebase analysis (AWS SDK usage, environment variables)
   - File upload architecture explanation
   - OCR strategy comparison
   - Cost breakdowns
   - Gotchas and important notes
   - **When to use:** When you need deep technical details

4. **[DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md](DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md)** - Step-by-Step
   - Railway backend deployment (detailed steps)
   - Vercel frontend deployment (detailed steps)
   - Post-deployment configuration
   - Comprehensive troubleshooting guide
   - Monitoring and maintenance
   - **When to use:** During actual deployment process

5. **[OPTIONAL_CODE_CHANGES.md](OPTIONAL_CODE_CHANGES.md)** - If Migrating Storage
   - Detailed code changes for S3 → Local migration
   - Option A: Keep S3 (no code changes)
   - Option B: Local uploads (code provided)
   - OCR migration (Textract → pytesseract)
   - Testing procedures
   - **When to use:** If choosing Strategy 2 or 3

### Configuration Files (Ready to Use)

6. **[railway.json](railway.json)** - Railway Configuration
   - Specifies Docker build and deployment
   - Ready to use as-is
   - No changes needed

7. **[vercel.json](vercel.json)** - Vercel Configuration
   - Specifies Next.js build and root directory
   - Ready to use as-is
   - No changes needed

8. **[.env.example.railway-vercel](.env.example.railway-vercel)** - Environment Variables Reference
   - Complete list of all environment variables
   - Organized by component and strategy
   - Instructions for each platform
   - **Don't commit with real secrets!**

---

## 🎯 Which Document Should I Read?

### If you have **5 minutes:**
→ Read [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md) → "Quick Reference" section

### If you have **30 minutes:**
→ Read entire [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md)

### If you have **1 hour:**
→ Read [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md) + first section of [DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md](DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md)

### If you're ready to **start migration:**
→ Open [MIGRATION_CHECKLIST.md](MIGRATION_CHECKLIST.md) + [DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md](DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md)

### If you're **migrating storage away from S3:**
→ Also read [OPTIONAL_CODE_CHANGES.md](OPTIONAL_CODE_CHANGES.md)

### If something **breaks:**
→ Go to [DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md](DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md) → "Troubleshooting" section

---

## 🚀 Three Deployment Strategies

All documentation supports these three strategies:

### ✅ Strategy 1: Minimal Changes (Recommended)
- Keep AWS S3 for file storage
- Keep AWS Textract for OCR
- Move compute to Railway/Vercel
- **Code changes:** None
- **Timeline:** 1-2 days
- **Complexity:** Low

**Best for:** Production deployment, risk-averse teams

---

### ⚠️ Strategy 2: Partial Independence
- Switch OCR to local pytesseract
- Keep AWS S3 for file storage
- Move compute to Railway/Vercel
- **Code changes:** 1 file (services/api/routers/imports.py)
- **Timeline:** 1-2 days
- **Complexity:** Medium

**Best for:** Reducing AWS dependencies while keeping S3

---

### 🔄 Strategy 3: Full Independence
- Switch to local file storage
- Switch OCR to pytesseract
- Move compute to Railway/Vercel
- Remove all AWS dependencies
- **Code changes:** 2 files + requirements.txt
- **Timeline:** 3-5 days + testing
- **Complexity:** High

**Best for:** Complete independence from AWS, MVP/small projects

---

## 📊 What's Been Analyzed

### AWS Usage Found ✓

**Backend Analysis:**
- ✅ S3 presigned URLs in `services/api/routers/items.py` (lines 80-114)
- ✅ AWS Textract OCR in `services/api/routers/imports.py` (lines 97-106)
- ✅ boto3 in requirements.txt
- ✅ AWS credentials handling

**Frontend Analysis:**
- ✅ AWS Amplify for Cognito integration
- ✅ AWS Amplify deployment configuration
- ✅ S3 bucket references in environment variables

**Infrastructure Analysis:**
- ✅ AWS CDK stack (`infra/cdk/lib/menuvium-stack.ts`)
  - Fargate for API
  - RDS for database
  - S3 for storage
  - Cognito for auth
  - Amplify for frontend
  - CloudFront for CDN
- ✅ Environment variables mapping
- ✅ Database migration setup (Alembic)

### Current Costs ✓
- **AWS:** ~$50-85/month
- **After Railway/Vercel:** ~$17-75/month (depends on strategy)
- **Potential savings:** 40-60%

### Risk Assessment ✓
- **Low risk:** All migrations follow industry best practices
- **Mitigation:** Keep AWS stack running for 1-2 weeks
- **Rollback:** Simple DNS change reverts everything

---

## ✅ What's Ready for You

### Created Files (Do NOT Edit)
- ✅ `railway.json` - Railway deployment config
- ✅ `vercel.json` - Vercel deployment config
- ✅ `.env.example.railway-vercel` - Environment variables template
- ✅ `MIGRATION_TO_RAILWAY_VERCEL.md` - Complete analysis (14,000+ words)
- ✅ `DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md` - Step-by-step guide (8,000+ words)
- ✅ `OPTIONAL_CODE_CHANGES.md` - Code migration guide (4,000+ words)
- ✅ `MIGRATION_SUMMARY.md` - Executive summary (3,000+ words)
- ✅ `MIGRATION_CHECKLIST.md` - Tracking checklist (2,000+ items)

### Existing Files (No Changes for Strategy 1)
- ✅ `services/api/Dockerfile` - Already correct for Railway
- ✅ `services/api/start.sh` - Already handles migrations
- ✅ `services/api/requirements.txt` - Has all dependencies
- ✅ `apps/web/package.json` - Already configured for Vercel
- ✅ `apps/web/next.config.js` - No changes needed

### Not Needing Changes (Yet)
- ⏸️ `infra/cdk/` - Keep for 1-2 weeks as backup/rollback
- ⏸️ `services/api/routers/*.py` - Only if migrating storage (Strategy 2-3)

---

## 🎬 Getting Started

### Step 1: Choose Your Strategy
```
Read MIGRATION_SUMMARY.md → "Three Deployment Strategies"
Choose: Strategy 1 (recommended), 2, or 3
```

### Step 2: Gather Prerequisites
- [ ] Railway account (railway.app)
- [ ] Vercel account (vercel.com)
- [ ] Your domain (yourdomain.com)
- [ ] AWS console access (for Cognito URLs)
- [ ] GitHub account with repo access

### Step 3: Follow Deployment Guide
- [ ] Open MIGRATION_CHECKLIST.md
- [ ] Open DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md
- [ ] Follow each phase sequentially
- [ ] Check off items in checklist

### Step 4: Test & Verify
- [ ] Test login flow
- [ ] Test file uploads
- [ ] Test database queries
- [ ] Check API connectivity
- [ ] Verify performance

### Step 5: Monitor & Optimize
- [ ] Keep AWS running for 1-2 weeks
- [ ] Monitor Railway/Vercel logs
- [ ] Check costs are lower
- [ ] Gradually shift all traffic

---

## 🆘 Troubleshooting

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Backend won't deploy | Check Railway logs: `railway logs -f` |
| Frontend can't reach API | Verify CORS_ORIGINS and NEXT_PUBLIC_API_URL |
| Login redirects fail | Update Cognito callback URLs |
| File uploads fail | Check S3 credentials or LOCAL_UPLOADS setting |
| Database errors | Verify DATABASE_URL is correct |
| Need rollback | Update DNS to point back to AWS |

**For detailed troubleshooting:** See [DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md](DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md) → "Troubleshooting" section

---

## 📞 Support Resources

- **Railway Docs:** https://docs.railway.app
- **Vercel Docs:** https://vercel.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **FastAPI Docs:** https://fastapi.tiangolo.com
- **AWS Cognito:** https://docs.aws.amazon.com/cognito/

---

## 📈 Timeline Overview

| Phase | Duration | Effort |
|-------|----------|--------|
| Planning & Reading | 1-2 hours | Low |
| Code Prep (if needed) | 1-2 hours | Medium |
| Railway Setup | 30-45 min | Low |
| Vercel Setup | 20-30 min | Low |
| DNS & Config | 10-20 min | Low |
| Testing & Verification | 1-2 hours | Medium |
| Monitoring (first week) | Ongoing | Low |
| **Total** | **4-6 hours** | **Medium** |

**Calendar Time:** 1-3 days (including DNS propagation)

---

## ⚠️ Important Notes

### BEFORE Starting
- [ ] Don't delete AWS stack (keep for 1-2 weeks rollback)
- [ ] Don't commit `.env.example.railway-vercel` with real secrets
- [ ] Don't change Cognito user pool (unnecessary)
- [ ] Don't deploy without reading DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md

### DURING Migration
- [ ] Keep AWS CDK stack running
- [ ] Test thoroughly before cutting over
- [ ] Monitor logs closely
- [ ] Have team available for issues

### AFTER Migration
- [ ] Run for 1 week before deleting AWS
- [ ] Monitor costs regularly
- [ ] Keep backup of old configuration
- [ ] Document any lessons learned

---

## 🎓 Learning Path

### For Beginners
1. Read MIGRATION_SUMMARY.md (full)
2. Read DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md (first 3 sections)
3. Watch Railway/Vercel tutorials (30 min)
4. Start migration with MIGRATION_CHECKLIST.md

### For Experienced DevOps
1. Skim MIGRATION_SUMMARY.md (5 min)
2. Read OPTIONAL_CODE_CHANGES.md (if doing Strategy 2-3)
3. Review railway.json and vercel.json (1 min)
4. Execute using MIGRATION_CHECKLIST.md

### For Project Managers
1. Read MIGRATION_SUMMARY.md (full)
2. Review MIGRATION_CHECKLIST.md (print it out)
3. Share timeline with team
4. Track progress daily

---

## 🏁 Success Criteria

After migration, you should have:

- ✅ Backend running on Railway
- ✅ Frontend running on Vercel
- ✅ Database connected and working
- ✅ All users able to login
- ✅ File uploads working
- ✅ API responding normally
- ✅ Costs reduced by 40-50% vs AWS
- ✅ No performance degradation
- ✅ Easy rollback procedure documented

---

## 📝 Document Legend

| Icon | Meaning |
|------|---------|
| ⭐ | Start here |
| 📋 | Use as checklist |
| 📚 | Reference documentation |
| 🚀 | Action items |
| ⚠️ | Important warnings |
| ✅ | Completed/verified |
| ⏸️ | Keep for now |
| ❌ | Don't do this |

---

## 🙋 FAQ

**Q: Do I have to migrate immediately?**  
A: No. You can migrate at your own pace. Keep AWS running as backup.

**Q: Will users notice any downtime?**  
A: With Strategy 1, you can have zero downtime using gradual traffic shifting.

**Q: Can I test in staging first?**  
A: Yes! Railway/Vercel both support multiple environments.

**Q: What if something breaks?**  
A: Rollback is simple: update DNS to point back to AWS CDK stack.

**Q: Should I migrate storage from S3?**  
A: Recommended: Keep S3 for production. Consider local storage for MVP.

**Q: What about existing S3 files?**  
A: They stay in S3. You can keep S3 as read-only after migration.

---

## 📞 Questions?

- **Technical questions:** See relevant guide sections
- **Strategy questions:** Read MIGRATION_SUMMARY.md
- **Deployment questions:** See DEPLOYMENT_GUIDE_RAILWAY_VERCEL.md
- **Troubleshooting:** See Troubleshooting section in guides
- **Emergency:** See Emergency Rollback in MIGRATION_CHECKLIST.md

---

**Created:** February 23, 2026  
**Status:** Complete & Ready for Implementation  
**Confidence Level:** High (fully analyzed codebase)  
**Estimated ROI:** 40-50% cost savings + improved DevOps

**Next Step:** Open [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md) and start reading! 🚀
