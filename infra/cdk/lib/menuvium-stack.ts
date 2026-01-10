import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as logs from 'aws-cdk-lib/aws-logs';
import { EnvironmentConfig } from '../config/dev';

export interface MenuviumStackProps extends cdk.StackProps {
    config: EnvironmentConfig;
    githubToken?: string;
    githubOwner?: string;
    githubRepo?: string;
}

export class MenuviumStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: MenuviumStackProps) {
        super(scope, id, props);

        const { config } = props;

        // 1. VPC with optional NAT instance for cost savings
        const vpc = new ec2.Vpc(this, 'MenuviumVPC', {
            maxAzs: 2,
            natGateways: config.enableNatInstance ? 0 : 1,
        });

        // Optional: Add NAT instance for dev environment
        if (config.enableNatInstance) {
            const natInstance = new ec2.Instance(this, 'NatInstance', {
                vpc,
                instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO),
                machineImage: new ec2.AmazonLinuxImage({
                    generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
                    cpuType: ec2.AmazonLinuxCpuType.ARM_64,
                }),
                vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
                sourceDestCheck: false,
            });
            natInstance.addUserData(
                'sysctl -w net.ipv4.ip_forward=1',
                'iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE'
            );
        }

        // 2. Database (RDS Postgres) with environment-specific sizing
        const db = new rds.DatabaseInstance(this, 'MenuviumDB', {
            engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_15 }),
            vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            instanceType: new ec2.InstanceType(config.dbInstanceType),
            allocatedStorage: config.dbAllocatedStorage,
            credentials: rds.Credentials.fromGeneratedSecret('postgres'),
            databaseName: 'menuvium',
            multiAz: config.dbMultiAz,
            backupRetention: cdk.Duration.days(config.dbBackupRetention),
            deleteAutomatedBackups: config.environment !== 'prod',
            removalPolicy: config.environment === 'prod' ? cdk.RemovalPolicy.SNAPSHOT : cdk.RemovalPolicy.DESTROY,
        });

        // 3. Auth (Cognito)
        const userPool = new cognito.UserPool(this, 'MenuviumUserPool', {
            selfSignUpEnabled: true,
            signInAliases: { email: true },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: false,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });
        const userPoolClient = userPool.addClient('MenuviumClient', {
            authFlows: {
                userPassword: true,
                userSrp: true,
            },
        });

        // 4. Storage (S3)
        const bucket = new s3.Bucket(this, 'MenuviumAssets', {
            cors: [{
                allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
                allowedOrigins: ['*'],
                allowedHeaders: ['*'],
            }],
            removalPolicy: config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: config.environment !== 'prod',
        });

        // 5. ECR Repository
        const apiRepo = new ecr.Repository(this, 'MenuviumApiRepo', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            emptyOnDelete: true,
        });

        // 6. Secrets
        const openAiSecretName = this.node.tryGetContext('openAiSecretName') || 'MenuviumOpenAIKey';
        const openAiSecret = secretsmanager.Secret.fromSecretNameV2(this, 'MenuviumOpenAiSecret', openAiSecretName);

        // 7. API (Fargate) with environment-specific sizing
        const cluster = new ecs.Cluster(this, 'MenuviumCluster', {
            vpc,
            containerInsights: config.enableDetailedMonitoring,
        });

        const corsOrigins = this.node.tryGetContext('corsOrigins') || process.env.CORS_ORIGINS;
        const openAiModel = this.node.tryGetContext('openAiModel') || process.env.OPENAI_MODEL;

        const apiEnvironment: Record<string, string> = {
            DB_HOST: db.dbInstanceEndpointAddress,
            DB_PORT: db.dbInstanceEndpointPort,
            DB_NAME: 'menuvium',
            DB_USER: 'postgres',
            COGNITO_USER_POOL_ID: userPool.userPoolId,
            COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
            S3_BUCKET_NAME: bucket.bucketName,
            OCR_MODE: 'textract',
            ENVIRONMENT: config.environment,
        };
        if (corsOrigins) {
            apiEnvironment.CORS_ORIGINS = corsOrigins;
        }
        if (openAiModel) {
            apiEnvironment.OPENAI_MODEL = openAiModel;
        }

        const apiService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'MenuviumApiService', {
            cluster,
            memoryLimitMiB: config.apiMemory,
            cpu: config.apiCpu,
            desiredCount: config.apiMinTasks,
            taskImageOptions: {
                image: ecs.ContainerImage.fromEcrRepository(apiRepo, 'latest'),
                environment: apiEnvironment,
                secrets: {
                    DB_PASSWORD: ecs.Secret.fromSecretsManager(db.secret!, 'password'),
                    OPENAI_API_KEY: ecs.Secret.fromSecretsManager(openAiSecret),
                },
                logDriver: ecs.LogDrivers.awsLogs({
                    streamPrefix: 'menuvium-api',
                    logRetention: config.logRetentionDays as logs.RetentionDays,
                }),
            },
            publicLoadBalancer: true,
        });

        // Auto-scaling
        const scaling = apiService.service.autoScaleTaskCount({
            minCapacity: config.apiMinTasks,
            maxCapacity: config.apiMaxTasks,
        });
        scaling.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 70,
        });

        // Allow API to access DB
        db.connections.allowFrom(apiService.service, ec2.Port.tcp(5432));

        // Allow API to access S3
        bucket.grantReadWrite(apiService.taskDefinition.taskRole);

        // 8. CloudFront (Optional, based on environment)
        let distribution: cloudfront.Distribution | undefined;
        if (config.enableCloudFront) {
            distribution = new cloudfront.Distribution(this, 'MenuviumCDN', {
                defaultBehavior: {
                    origin: new origins.S3Origin(bucket),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                },
                additionalBehaviors: {
                    '/api/*': {
                        origin: new origins.LoadBalancerV2Origin(apiService.loadBalancer, {
                            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
                        }),
                        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                    },
                },
                priceClass: config.cloudfrontPriceClass as cloudfront.PriceClass,
            });
        }

        // 9. Amplify (Frontend) - Optional, requires GitHub token
        let amplifyApp: amplify.App | undefined;
        if (props.githubToken && props.githubOwner && props.githubRepo) {
            amplifyApp = new amplify.App(this, 'MenuviumFrontend', {
                sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
                    owner: props.githubOwner,
                    repository: props.githubRepo,
                    oauthToken: cdk.SecretValue.unsafePlainText(props.githubToken),
                }),
                environmentVariables: {
                    NEXT_PUBLIC_API_URL: distribution
                        ? `https://${distribution.distributionDomainName}/api`
                        : `http://${apiService.loadBalancer.loadBalancerDnsName}`,
                    NEXT_PUBLIC_USER_POOL_ID: userPool.userPoolId,
                    NEXT_PUBLIC_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
                    NEXT_PUBLIC_S3_BUCKET: bucket.bucketName,
                },
                autoBranchDeletion: true,
            });

            amplifyApp.addBranch(config.amplifyBranch, {
                autoBuild: config.amplifyAutoBuild,
                stage: config.environment === 'prod' ? 'PRODUCTION' : 'DEVELOPMENT',
            });
        }

        // Outputs
        new cdk.CfnOutput(this, 'Environment', { value: config.environment });
        new cdk.CfnOutput(this, 'ApiUrl', {
            value: distribution
                ? `https://${distribution.distributionDomainName}/api`
                : `http://${apiService.loadBalancer.loadBalancerDnsName}`
        });
        new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
        new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
        new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
        new cdk.CfnOutput(this, 'ApiRepoName', { value: apiRepo.repositoryName });
        new cdk.CfnOutput(this, 'ApiRepoUri', { value: apiRepo.repositoryUri });

        if (distribution) {
            new cdk.CfnOutput(this, 'CloudFrontUrl', { value: `https://${distribution.distributionDomainName}` });
        }

        if (amplifyApp) {
            new cdk.CfnOutput(this, 'AmplifyAppId', { value: amplifyApp.appId });
            new cdk.CfnOutput(this, 'AmplifyDefaultDomain', { value: amplifyApp.defaultDomain });
        }
    }
}
