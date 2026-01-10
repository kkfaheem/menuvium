#!/bin/bash
set -e

# Menuvium Secrets Setup Script
# Creates required secrets in AWS Secrets Manager

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

AWS_REGION="${AWS_REGION:-us-east-1}"

echo -e "${GREEN}🔐 Menuvium Secrets Setup${NC}"
echo "Region: $AWS_REGION"
echo ""

# OpenAI API Key
OPENAI_SECRET_NAME="MenuviumOpenAIKey"

if aws secretsmanager describe-secret --secret-id "$OPENAI_SECRET_NAME" --region "$AWS_REGION" &>/dev/null; then
    echo -e "${YELLOW}⚠️  Secret '$OPENAI_SECRET_NAME' already exists${NC}"
    read -p "Update it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -sp "Enter OpenAI API Key: " OPENAI_KEY
        echo
        aws secretsmanager update-secret \
            --secret-id "$OPENAI_SECRET_NAME" \
            --secret-string "$OPENAI_KEY" \
            --region "$AWS_REGION"
        echo -e "${GREEN}✅ Secret updated${NC}"
    fi
else
    echo "Creating OpenAI API Key secret..."
    read -sp "Enter OpenAI API Key: " OPENAI_KEY
    echo
    
    if [ -z "$OPENAI_KEY" ]; then
        echo -e "${RED}❌ OpenAI API Key cannot be empty${NC}"
        exit 1
    fi
    
    aws secretsmanager create-secret \
        --name "$OPENAI_SECRET_NAME" \
        --description "OpenAI API key for Menuvium menu parsing" \
        --secret-string "$OPENAI_KEY" \
        --region "$AWS_REGION"
    
    echo -e "${GREEN}✅ Secret created: $OPENAI_SECRET_NAME${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Secrets setup complete!${NC}"
echo ""
echo "Secrets created:"
echo "  - $OPENAI_SECRET_NAME"
