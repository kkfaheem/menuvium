#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MenuviumStack } from '../lib/menuvium-stack';
import { devConfig } from '../config/dev';
import { stagingConfig } from '../config/staging';
import { prodConfig } from '../config/prod';

const app = new cdk.App();

// Get environment from context or environment variable
const environment = app.node.tryGetContext('environment') || process.env.ENVIRONMENT || 'dev';

// Select configuration based on environment
const configMap = {
    dev: devConfig,
    staging: stagingConfig,
    prod: prodConfig,
};

const config = configMap[environment as keyof typeof configMap];
if (!config) {
    throw new Error(`Invalid environment: ${environment}. Must be one of: dev, staging, prod`);
}

// Optional GitHub integration for Amplify
const githubToken = process.env.GITHUB_TOKEN;
const githubOwner = process.env.GITHUB_OWNER || 'your-github-username';
const githubRepo = process.env.GITHUB_REPO || 'menuvium';

new MenuviumStack(app, `Menuvium-${config.environment}`, {
    config,
    githubToken,
    githubOwner,
    githubRepo,
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    description: `Menuvium ${config.environment} environment`,
    tags: {
        Environment: config.environment,
        Project: 'Menuvium',
        ManagedBy: 'CDK',
    },
});
