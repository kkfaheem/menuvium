#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MenuviumStack } from '../lib/menuvium-stack';

const app = new cdk.App();
new MenuviumStack(app, 'MenuviumStack', {
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
