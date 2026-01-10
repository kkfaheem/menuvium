#!/bin/bash
set -e

# Menuvium API Deployment Script
# Builds Docker image, pushes to ECR, and updates ECS service

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_DIR="$PROJECT_ROOT/services/api"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")

echo -e "${GREEN}🚀 Menuvium API Deployment${NC}"
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo ""

# Validate AWS credentials
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}❌ Error: AWS credentials not configured${NC}"
    echo "Please run: aws configure"
    exit 1
fi

# Get ECR repository name from CDK outputs
STACK_NAME="Menuvium-${ENVIRONMENT}"
echo "📋 Getting ECR repository from stack: $STACK_NAME"

ECR_REPO_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiRepoName'].OutputValue" \
    --output text \
    --region "$AWS_REGION" 2>/dev/null || echo "")

if [ -z "$ECR_REPO_NAME" ]; then
    echo -e "${RED}❌ Error: Could not find ECR repository${NC}"
    echo "Make sure the CDK stack is deployed first"
    exit 1
fi

ECR_REPO_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME"
echo "ECR Repository: $ECR_REPO_URI"
echo ""

# Get git commit SHA for tagging
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
IMAGE_TAG="${GIT_SHA}-${ENVIRONMENT}"

echo "🐳 Building Docker image..."
cd "$API_DIR"
docker build -t menuvium-api:$IMAGE_TAG -t menuvium-api:latest .

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker build successful${NC}"
echo ""

# Login to ECR
echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
    docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ ECR login failed${NC}"
    exit 1
fi

# Tag images
echo "🏷️  Tagging images..."
docker tag menuvium-api:$IMAGE_TAG "$ECR_REPO_URI:$IMAGE_TAG"
docker tag menuvium-api:latest "$ECR_REPO_URI:latest"

# Push to ECR
echo "📤 Pushing to ECR..."
docker push "$ECR_REPO_URI:$IMAGE_TAG"
docker push "$ECR_REPO_URI:latest"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ ECR push failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Images pushed successfully${NC}"
echo ""

# Update ECS service
echo "🔄 Updating ECS service..."
CLUSTER_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?contains(OutputKey, 'Cluster')].OutputValue" \
    --output text \
    --region "$AWS_REGION" 2>/dev/null || echo "")

if [ -n "$CLUSTER_NAME" ]; then
    SERVICE_NAME=$(aws ecs list-services --cluster "$CLUSTER_NAME" --region "$AWS_REGION" \
        --query "serviceArns[0]" --output text | awk -F'/' '{print $NF}')
    
    if [ -n "$SERVICE_NAME" ]; then
        aws ecs update-service \
            --cluster "$CLUSTER_NAME" \
            --service "$SERVICE_NAME" \
            --force-new-deployment \
            --region "$AWS_REGION" > /dev/null
        
        echo -e "${GREEN}✅ ECS service update initiated${NC}"
        echo "Service will redeploy with new image"
    else
        echo -e "${YELLOW}⚠️  Could not find ECS service${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Could not find ECS cluster${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo "Image: $ECR_REPO_URI:$IMAGE_TAG"
