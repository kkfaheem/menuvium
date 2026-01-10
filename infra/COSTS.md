# AWS Cost Breakdown by Environment

## Development Environment

### Monthly Costs

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| **ECS Fargate** | 0.25 vCPU, 512 MB, 1 task | $29.55 |
| **Application Load Balancer** | Standard ALB | $16.43 |
| **RDS PostgreSQL** | t4g.micro, 20 GB, Single-AZ | $12.41 |
| **NAT Instance** | t4g.nano (instead of NAT Gateway) | $3.00 |
| **S3** | 10 GB storage, low traffic | $0.25 |
| **ECR** | 1 GB Docker images | $0.10 |
| **Secrets Manager** | 2 secrets | $0.80 |
| **Cognito** | <50k MAU | $0.00 |
| **CloudWatch Logs** | 7-day retention, 5 GB | $2.50 |
| **Data Transfer** | Minimal | $1.00 |
| **TOTAL** | | **~$66/month** |

### Cost Optimizations Applied
- ✅ NAT instance instead of NAT Gateway (saves $30/month)
- ✅ CloudFront disabled (saves $1/month)
- ✅ t4g instances (ARM-based, 20% cheaper)
- ✅ Minimal task count (1)
- ✅ Short log retention (7 days)

---

## Staging Environment

### Monthly Costs

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| **ECS Fargate** | 0.5 vCPU, 1 GB, 1-4 tasks (avg 1.5) | $88.65 |
| **Application Load Balancer** | Standard ALB | $16.43 |
| **RDS PostgreSQL** | t4g.small, 50 GB, Single-AZ | $24.82 |
| **NAT Gateway** | 1 NAT Gateway | $32.85 |
| **S3** | 25 GB storage | $0.60 |
| **CloudFront** | 50 GB transfer, 500k requests | $5.00 |
| **ECR** | 2 GB Docker images | $0.20 |
| **Secrets Manager** | 2 secrets | $0.80 |
| **Cognito** | <50k MAU | $0.00 |
| **CloudWatch Logs** | 14-day retention, 15 GB | $7.50 |
| **Data Transfer** | Moderate | $3.00 |
| **TOTAL** | | **~$180/month** |

### Features Enabled
- ✅ CloudFront CDN for realistic testing
- ✅ Enhanced monitoring
- ✅ Auto-scaling (1-4 tasks)
- ✅ Longer log retention (14 days)

---

## Production Environment

### Monthly Costs

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| **ECS Fargate** | 1 vCPU, 2 GB, 2-10 tasks (avg 3) | $354.24 |
| **Application Load Balancer** | Standard ALB | $16.43 |
| **RDS PostgreSQL** | t4g.medium, 100 GB, Multi-AZ | $99.28 |
| **NAT Gateway** | 1 NAT Gateway | $32.85 |
| **S3** | 100 GB storage | $2.30 |
| **CloudFront** | 500 GB transfer, 5M requests (global) | $50.00 |
| **ECR** | 5 GB Docker images | $0.50 |
| **Secrets Manager** | 2 secrets | $0.80 |
| **Cognito** | <50k MAU | $0.00 |
| **CloudWatch Logs** | 90-day retention, 50 GB | $25.00 |
| **Data Transfer** | High | $10.00 |
| **Amplify Hosting** | 100 GB served, 20 builds | $15.00 |
| **TOTAL** | | **~$606/month** |

### Production Features
- ✅ Multi-AZ database for high availability
- ✅ Global CloudFront distribution
- ✅ Auto-scaling (2-10 tasks)
- ✅ 90-day log retention
- ✅ Amplify hosting with CI/CD
- ✅ Detailed monitoring

---

## Cost Optimization Strategies

### Short-term (Immediate)

1. **Use Reserved Instances for RDS**
   - 1-year commitment: Save 30-40%
   - Dev: $12.41 → $7.59/month
   - Prod: $99.28 → $60.00/month

2. **Use Fargate Savings Plans**
   - 1-year commitment: Save up to 50%
   - Dev: $29.55 → $14.78/month
   - Prod: $354.24 → $177.12/month

3. **Enable S3 Intelligent-Tiering**
   - Automatically moves data to cheaper tiers
   - Save 20-40% on storage costs

4. **Optimize CloudWatch Logs**
   - Export old logs to S3
   - Use log filtering to reduce volume
   - Save 50-70% on log storage

### Medium-term (1-3 months)

1. **Implement Caching**
   - Add Redis/ElastiCache for API responses
   - Reduce database load
   - Potentially reduce RDS instance size

2. **Optimize Images**
   - Use WebP format
   - Implement lazy loading
   - Reduce S3 storage and transfer costs

3. **Right-size Resources**
   - Monitor actual usage
   - Adjust Fargate CPU/memory
   - Scale down during off-hours

### Long-term (3-6 months)

1. **Multi-region Strategy**
   - Use CloudFront edge locations
   - Reduce data transfer costs
   - Improve global performance

2. **Serverless Migration**
   - Consider Lambda for API endpoints
   - Use Aurora Serverless for database
   - Pay only for actual usage

3. **CDN Optimization**
   - Increase cache hit ratio
   - Reduce origin requests
   - Lower CloudFront costs

---

## Cost Comparison with Optimizations

### Development (Optimized)

| Item | Before | After | Savings |
|------|--------|-------|---------|
| RDS Reserved | $12.41 | $7.59 | $4.82 |
| Fargate Savings Plan | $29.55 | $14.78 | $14.77 |
| **Total** | **$66** | **$47** | **$19/mo** |

### Production (Optimized)

| Item | Before | After | Savings |
|------|--------|-------|---------|
| RDS Reserved | $99.28 | $60.00 | $39.28 |
| Fargate Savings Plan | $354.24 | $177.12 | $177.12 |
| S3 Intelligent-Tiering | $2.30 | $1.50 | $0.80 |
| CloudWatch Optimization | $25.00 | $10.00 | $15.00 |
| **Total** | **$606** | **$374** | **$232/mo** |

**Annual Savings: $2,784**

---

## Scaling Projections

### At 1,000 Active Users

- **Dev**: ~$47/month (optimized)
- **Staging**: ~$120/month
- **Prod**: ~$400/month (with optimizations)

### At 10,000 Active Users

- **Prod**: ~$800/month
  - Fargate: 5-15 tasks (avg 8)
  - RDS: t4g.large
  - CloudFront: 2 TB transfer
  - Cognito: Still free (<50k MAU)

### At 100,000 Active Users

- **Prod**: ~$2,500/month
  - Fargate: 20-50 tasks
  - RDS: r6g.xlarge with read replicas
  - CloudFront: 10 TB transfer
  - Cognito: $2,750 (55k MAU × $0.05)
  - ElastiCache: Redis cluster
  - Total: ~$5,250/month

---

## Alternative Architectures

### Serverless (Lambda + Aurora Serverless)

**Pros:**
- Pay per request
- Auto-scaling to zero
- Lower costs at low traffic

**Cons:**
- Cold starts
- More complex architecture
- Vendor lock-in

**Cost at low traffic:** ~$20-30/month
**Cost at high traffic:** Similar to Fargate

### Kubernetes (EKS)

**Pros:**
- More control
- Better for microservices
- Portable

**Cons:**
- Higher base cost ($73/month for control plane)
- More complex to manage
- Requires DevOps expertise

**Minimum cost:** ~$150/month

### EC2 (Self-managed)

**Pros:**
- Full control
- Potentially cheaper at scale
- No container overhead

**Cons:**
- Manual scaling
- More maintenance
- Security patching required

**Cost:** ~$50-100/month (with Reserved Instances)

---

## Recommendations

### For Pilot/MVP (Current Stage)
- ✅ Use **Dev environment** configuration
- ✅ Deploy to single region (us-east-1)
- ✅ Use NAT instance instead of NAT Gateway
- ✅ Skip CloudFront initially
- ✅ **Total: ~$47/month** (with optimizations)

### For Beta/Early Customers
- ✅ Use **Staging environment** configuration
- ✅ Enable CloudFront for better UX
- ✅ Add basic monitoring
- ✅ **Total: ~$120/month**

### For Production Launch
- ✅ Use **Production environment** configuration
- ✅ Enable all optimizations (Reserved Instances, Savings Plans)
- ✅ Multi-AZ database
- ✅ Global CloudFront
- ✅ **Total: ~$374/month** (optimized)

### When to Upgrade

| Metric | Action |
|--------|--------|
| >500 users | Move from dev to staging |
| >5,000 users | Move from staging to prod |
| >50,000 users | Consider multi-region |
| >100,000 users | Add read replicas, caching |

---

## Cost Monitoring

### Set Up Billing Alerts

```bash
# Create SNS topic for alerts
aws sns create-topic --name menuvium-billing-alerts

# Subscribe to email
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT:menuvium-billing-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com

# Create CloudWatch alarm for $100/month
aws cloudwatch put-metric-alarm \
  --alarm-name menuvium-cost-alert \
  --alarm-description "Alert when monthly costs exceed $100" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --evaluation-periods 1 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT:menuvium-billing-alerts
```

### Use AWS Cost Explorer

- View costs by service
- Identify cost trends
- Forecast future costs
- Find optimization opportunities

### Tag Resources

All resources are tagged with:
- `Environment`: dev/staging/prod
- `Project`: Menuvium
- `ManagedBy`: CDK

Use these tags in Cost Explorer to track costs per environment.
