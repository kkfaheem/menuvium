import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export class MenuviumStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // 1. VPC
        const vpc = new ec2.Vpc(this, 'MenuviumVPC', {
            maxAzs: 2,
        });

        // 2. Database (RDS Postgres)
        const db = new rds.DatabaseInstance(this, 'MenuviumDB', {
            engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_15 }),
            vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO), // Free tier friendly
            allocatedStorage: 20,
            credentials: rds.Credentials.fromGeneratedSecret('postgres'),
            databaseName: 'menuvium',
        });

        // 3. Auth (Cognito)
        const userPool = new cognito.UserPool(this, 'MenuviumUserPool', {
            selfSignUpEnabled: true,
            signInAliases: { email: true },
        });
        const userPoolClient = userPool.addClient('MenuviumClient');

        // 4. Storage (S3)
        const bucket = new s3.Bucket(this, 'MenuviumAssets', {
            cors: [{
                allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
                allowedOrigins: ['*'],
                allowedHeaders: ['*'],
            }],
        });

        const apiRepo = new ecr.Repository(this, 'MenuviumApiRepo');

        const corsOrigins = this.node.tryGetContext('corsOrigins') || process.env.CORS_ORIGINS;
        const apiEnvironment: Record<string, string> = {
            DB_HOST: db.dbInstanceEndpointAddress,
            DB_PORT: db.dbInstanceEndpointPort,
            DB_NAME: 'menuvium',
            DB_USER: 'postgres',
            COGNITO_USER_POOL_ID: userPool.userPoolId,
            COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
            S3_BUCKET_NAME: bucket.bucketName,
        };
        if (corsOrigins) {
            apiEnvironment.CORS_ORIGINS = corsOrigins;
        }

        // 5. API (Fargate)
        const cluster = new ecs.Cluster(this, 'MenuviumCluster', { vpc });
        const apiService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'MenuviumApiService', {
            cluster,
            memoryLimitMiB: 512,
            cpu: 256,
            taskImageOptions: {
                image: ecs.ContainerImage.fromEcrRepository(apiRepo, 'latest'),
                environment: apiEnvironment,
                secrets: {
                    DB_PASSWORD: ecs.Secret.fromSecretsManager(db.secret!, 'password'),
                }
            },
            publicLoadBalancer: true,
        });

        // Allow API to access DB
        db.connections.allowFrom(apiService.service, ec2.Port.tcp(5432));

        // Allow API to access S3
        bucket.grantReadWrite(apiService.taskDefinition.taskRole);


        // Outputs
        new cdk.CfnOutput(this, 'ApiUrl', { value: apiService.loadBalancer.loadBalancerDnsName });
        new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
        new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
        new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
        new cdk.CfnOutput(this, 'ApiRepoName', { value: apiRepo.repositoryName });
    }
}
