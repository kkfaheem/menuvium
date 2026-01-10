// Environment-specific configuration for Menuvium CDK stack

export interface EnvironmentConfig {
    environment: 'dev' | 'staging' | 'prod';

    // Database
    dbInstanceType: string;
    dbAllocatedStorage: number;
    dbMultiAz: boolean;
    dbBackupRetention: number;

    // API (Fargate)
    apiCpu: number;
    apiMemory: number;
    apiMinTasks: number;
    apiMaxTasks: number;

    // Frontend (Amplify)
    amplifyBranch: string;
    amplifyAutoBuild: boolean;

    // CloudFront
    enableCloudFront: boolean;
    cloudfrontPriceClass: string;

    // Monitoring
    enableDetailedMonitoring: boolean;
    logRetentionDays: number;

    // Cost optimization
    enableNatInstance: boolean; // Use NAT instance instead of NAT Gateway
}

export const devConfig: EnvironmentConfig = {
    environment: 'dev',

    // Database - minimal for development
    dbInstanceType: 't4g.micro',
    dbAllocatedStorage: 20,
    dbMultiAz: false,
    dbBackupRetention: 1,

    // API - minimal resources
    apiCpu: 256,        // 0.25 vCPU
    apiMemory: 512,     // 0.5 GB
    apiMinTasks: 1,
    apiMaxTasks: 2,

    // Frontend
    amplifyBranch: 'dev',
    amplifyAutoBuild: true,

    // CloudFront - disabled for dev to save costs
    enableCloudFront: false,
    cloudfrontPriceClass: 'PriceClass_100', // US, Canada, Europe

    // Monitoring - basic
    enableDetailedMonitoring: false,
    logRetentionDays: 7,

    // Cost optimization - use NAT instance
    enableNatInstance: true,
};
