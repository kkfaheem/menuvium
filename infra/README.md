# Menuvium Infrastructure Deployment Guide

Complete guide for deploying Menuvium to AWS using CDK.

## Prerequisites

- AWS CLI configured with credentials
- Node.js 18+ and npm
- Docker installed and running
- Git repository (for Amplify integration)

## Quick Start

### 1. Install Dependencies

```bash
cd infra/cdk
npm install
```

### 2. Set Up Secrets

```bash
cd infra/scripts
chmod +x *.sh
./setup-secrets.sh
```

This will prompt you for:
- OpenAI API Key (required for menu parsing)

### 3. Deploy Infrastructure

```bash
# Deploy to dev environment (default)
./deploy-stack.sh

# Or specify environment
ENVIRONMENT=staging ./deploy-stack.sh
ENVIRONMENT=prod ./deploy-stack.sh
```

### 4. Deploy API

```bash
# Build and push Docker image
./deploy-api.sh

# Or specify environment
ENVIRONMENT=staging ./deploy-api.sh
```

## Environment Configurations

### Development (`dev`)
- **Cost**: ~$45/month
- **Database**: t4g.micro, 20 GB, Single-AZ
- **API**: 0.25 vCPU, 512 MB RAM, 1-2 tasks
- **NAT**: NAT instance (cost-optimized)
- **CloudFront**: Disabled
- **Monitoring**: Basic

### Staging (`staging`)
- **Cost**: ~$120/month
- **Database**: t4g.small, 50 GB, Single-AZ
- **API**: 0.5 vCPU, 1 GB RAM, 1-4 tasks
- **NAT**: NAT Gateway
- **CloudFront**: Enabled
- **Monitoring**: Enhanced

### Production (`prod`)
- **Cost**: ~$250/month
- **Database**: t4g.medium, 100 GB, Multi-AZ
- **API**: 1 vCPU, 2 GB RAM, 2-10 tasks
- **NAT**: NAT Gateway
- **CloudFront**: Enabled (global)
- **Monitoring**: Full with 90-day retention

## Amplify Integration (Optional)

To enable automatic frontend deployment from GitHub:

### 1. Create GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with `repo` scope
3. Save the token securely

### 2. Set Environment Variables

```bash
export GITHUB_TOKEN="your-github-token"
export GITHUB_OWNER="your-github-username"
export GITHUB_REPO="menuvium"
```

### 3. Deploy Stack

```bash
ENVIRONMENT=prod ./deploy-stack.sh
```

The stack will create an Amplify app connected to your GitHub repository.

## Manual Deployment Steps

### Step-by-Step CDK Deployment

```bash
cd infra/cdk

# 1. Bootstrap CDK (first time only)
npx cdk bootstrap

# 2. Synthesize stack
npx cdk synth -c environment=dev

# 3. Check what will be deployed
npx cdk diff -c environment=dev

# 4. Deploy
npx cdk deploy -c environment=dev
```

### Step-by-Step API Deployment

```bash
# 1. Get ECR repository URI from stack outputs
aws cloudformation describe-stacks \
  --stack-name Menuvium-dev \
  --query "Stacks[0].Outputs[?OutputKey=='ApiRepoUri'].OutputValue" \
  --output text

# 2. Build Docker image
cd services/api
docker build -t menuvium-api .

# 3. Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# 4. Tag and push
docker tag menuvium-api:latest <ecr-repo-uri>:latest
docker push <ecr-repo-uri>:latest

# 5. Update ECS service (force new deployment)
aws ecs update-service \
  --cluster <cluster-name> \
  --service <service-name> \
  --force-new-deployment
```

## Stack Outputs

After deployment, you'll get these outputs:

- **ApiUrl**: API endpoint URL
- **UserPoolId**: Cognito User Pool ID
- **UserPoolClientId**: Cognito Client ID
- **BucketName**: S3 bucket for uploads
- **ApiRepoUri**: ECR repository URI
- **CloudFrontUrl**: CDN URL (if enabled)
- **AmplifyAppId**: Amplify app ID (if configured)

## Environment Variables for Frontend

Add these to your Next.js `.env.local`:

```bash
NEXT_PUBLIC_API_URL=<ApiUrl or CloudFrontUrl>/api
NEXT_PUBLIC_USER_POOL_ID=<UserPoolId>
NEXT_PUBLIC_USER_POOL_CLIENT_ID=<UserPoolClientId>
NEXT_PUBLIC_S3_BUCKET=<BucketName>
```

## Updating the Stack

### Update Infrastructure

```bash
# Make changes to CDK code
cd infra/cdk/lib/menuvium-stack.ts

# Deploy changes
cd ../scripts
./deploy-stack.sh
```

### Update API Code

```bash
# Make changes to API code
cd services/api

# Deploy new version
cd ../../infra/scripts
./deploy-api.sh
```

## Monitoring and Logs

### View ECS Logs

```bash
# Get log group name
aws logs describe-log-groups --log-group-name-prefix /ecs/menuvium

# Tail logs
aws logs tail /ecs/menuvium-api --follow
```

### View CloudWatch Metrics

```bash
# API CPU utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=<service-name> \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

## Cost Optimization Tips

### Development
1. Use NAT instance instead of NAT Gateway (saves ~$30/month)
2. Stop RDS instance when not in use
3. Disable CloudFront
4. Use t4g instances (ARM-based, cheaper)

### Production
1. Use Reserved Instances for RDS (save 30-40%)
2. Use Savings Plans for Fargate (save up to 50%)
3. Enable S3 Intelligent-Tiering
4. Set up CloudWatch alarms for cost anomalies

## Troubleshooting

### CDK Bootstrap Failed
```bash
# Ensure AWS credentials are configured
aws sts get-caller-identity

# Bootstrap with explicit account/region
npx cdk bootstrap aws://ACCOUNT-ID/REGION
```

### Docker Build Failed
```bash
# Check Docker is running
docker ps

# Clean Docker cache
docker system prune -a
```

### ECS Tasks Not Starting
```bash
# Check task logs
aws ecs describe-tasks \
  --cluster <cluster-name> \
  --tasks <task-arn>

# Check stopped tasks
aws ecs list-tasks \
  --cluster <cluster-name> \
  --desired-status STOPPED
```

### Database Connection Failed
```bash
# Verify security groups
aws ec2 describe-security-groups \
  --group-ids <db-security-group-id>

# Test connection from ECS task
# (exec into running container)
aws ecs execute-command \
  --cluster <cluster-name> \
  --task <task-id> \
  --container api \
  --interactive \
  --command "/bin/bash"
```

## Cleanup

### Destroy Stack

```bash
# Delete all resources
cd infra/cdk
npx cdk destroy -c environment=dev

# Or use script
cd ../scripts
ENVIRONMENT=dev ./destroy-stack.sh
```

**Warning**: This will delete:
- Database (unless using RETAIN policy in prod)
- S3 bucket (unless using RETAIN policy in prod)
- All ECS tasks and services
- Load balancer
- VPC and networking

## Security Best Practices

1. **Secrets**: Never commit secrets to Git
2. **IAM**: Use least-privilege IAM roles
3. **VPC**: Keep database in private subnets
4. **SSL**: Always use HTTPS (CloudFront/ALB)
5. **Backups**: Enable automated backups for RDS
6. **MFA**: Enable MFA for AWS root account
7. **Monitoring**: Set up CloudWatch alarms

## Support

For issues or questions:
1. Check CloudWatch Logs
2. Review stack events in CloudFormation console
3. Check ECS service events
4. Review this documentation

## Next Steps

1. Set up custom domain with Route 53
2. Configure SSL certificate with ACM
3. Set up CI/CD pipeline
4. Enable AWS WAF for security
5. Set up backup and disaster recovery
6. Configure monitoring and alerting
