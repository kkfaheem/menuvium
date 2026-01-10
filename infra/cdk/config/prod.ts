// Production environment configuration

import { EnvironmentConfig } from './dev';

export const prodConfig: EnvironmentConfig = {
    environment: 'prod',

    // Database - production-ready with high availability
    dbInstanceType: 't4g.medium',
    dbAllocatedStorage: 100,
    dbMultiAz: true, // Multi-AZ for high availability
    dbBackupRetention: 30,

    // API - production resources with auto-scaling
    apiCpu: 1024,       // 1 vCPU
    apiMemory: 2048,    // 2 GB
    apiMinTasks: 2,     // Always run 2 for availability
    apiMaxTasks: 10,    // Scale up to 10 under load

    // Frontend
    amplifyBranch: 'main',
    amplifyAutoBuild: true,

    // CloudFront - enabled with global distribution
    enableCloudFront: true,
    cloudfrontPriceClass: 'PriceClass_All', // Global distribution

    // Monitoring - full monitoring and long retention
    enableDetailedMonitoring: true,
    logRetentionDays: 90,

    // Cost optimization - use NAT Gateway for reliability
    enableNatInstance: false,
};
