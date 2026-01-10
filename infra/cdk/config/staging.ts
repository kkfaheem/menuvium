// Staging environment configuration

import { EnvironmentConfig } from './dev';

export const stagingConfig: EnvironmentConfig = {
    environment: 'staging',

    // Database - moderate resources
    dbInstanceType: 't4g.small',
    dbAllocatedStorage: 50,
    dbMultiAz: false, // Single-AZ for staging
    dbBackupRetention: 7,

    // API - moderate resources
    apiCpu: 512,        // 0.5 vCPU
    apiMemory: 1024,    // 1 GB
    apiMinTasks: 1,
    apiMaxTasks: 4,

    // Frontend
    amplifyBranch: 'staging',
    amplifyAutoBuild: true,

    // CloudFront - enabled for realistic testing
    enableCloudFront: true,
    cloudfrontPriceClass: 'PriceClass_100',

    // Monitoring - enhanced
    enableDetailedMonitoring: true,
    logRetentionDays: 14,

    // Cost optimization - use NAT Gateway for reliability
    enableNatInstance: false,
};
