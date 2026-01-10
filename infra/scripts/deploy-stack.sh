#!/bin/bash
set -e

# Menuvium CDK Stack Deployment Script
# Validates prerequisites, deploys CDK stack, and runs health checks

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDK_DIR="$SCRIPT_DIR/../cdk"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Menuvium CDK Stack Deployment       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo ""

# Validate AWS credentials
echo "🔍 Validating AWS credentials..."
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")

if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}❌ Error: AWS credentials not configured${NC}"
    echo "Please run: aws configure"
    exit 1
fi

echo -e "${GREEN}✅ AWS Account: $AWS_ACCOUNT_ID${NC}"
echo ""

# Check required secrets
echo "🔍 Checking required secrets..."
OPENAI_SECRET_NAME="MenuviumOpenAIKey"

if ! aws secretsmanager describe-secret --secret-id "$OPENAI_SECRET_NAME" --region "$AWS_REGION" &>/dev/null; then
    echo -e "${YELLOW}⚠️  Warning: Secret '$OPENAI_SECRET_NAME' not found${NC}"
    echo "Create it with: ./scripts/setup-secrets.sh"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✅ OpenAI secret found${NC}"
fi

echo ""

# Bootstrap CDK (if needed)
echo "🔍 Checking CDK bootstrap..."
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region "$AWS_REGION" &>/dev/null; then
    echo -e "${YELLOW}⚠️  CDK not bootstrapped in this region${NC}"
    read -p "Bootstrap now? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$CDK_DIR"
        npx cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION
    else
        echo "Please run: cd infra/cdk && npx cdk bootstrap"
        exit 1
    fi
else
    echo -e "${GREEN}✅ CDK bootstrapped${NC}"
fi

echo ""

# Install dependencies
echo "📦 Installing CDK dependencies..."
cd "$CDK_DIR"
npm install --silent

echo ""

# Synthesize stack
echo "🔨 Synthesizing CDK stack..."
npx cdk synth -c environment=$ENVIRONMENT --quiet

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ CDK synthesis failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Synthesis successful${NC}"
echo ""

# Show diff (optional)
echo "📊 Checking for changes..."
npx cdk diff -c environment=$ENVIRONMENT || true
echo ""

# Deploy
echo "🚀 Deploying stack..."
read -p "Proceed with deployment? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

npx cdk deploy -c environment=$ENVIRONMENT --require-approval never

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Stack deployed successfully${NC}"
echo ""

# Get outputs
echo "📋 Stack Outputs:"
STACK_NAME="Menuvium-${ENVIRONMENT}"
aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs" \
    --output table \
    --region "$AWS_REGION"

echo ""

# Health check
echo "🏥 Running health check..."
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
    --output text \
    --region "$AWS_REGION")

if [ -n "$API_URL" ]; then
    echo "API URL: $API_URL"
    echo "Waiting for API to be ready..."
    sleep 10
    
    if curl -sf "${API_URL}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API health check passed${NC}"
    else
        echo -e "${YELLOW}⚠️  API not responding yet (this is normal for first deployment)${NC}"
        echo "The API will be available once the Docker image is pushed and ECS tasks start"
    fi
fi

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Push your API Docker image: ./scripts/deploy-api.sh"
echo "2. Configure Amplify (if using GitHub integration)"
echo "3. Set up custom domain (optional)"
