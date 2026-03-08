import { BedrockAgentRuntimeClient } from "@aws-sdk/client-bedrock-agent-runtime";
import { S3Client } from "@aws-sdk/client-s3";
import { SageMakerClient } from "@aws-sdk/client-sagemaker";

const region = process.env.AWS_REGION ?? "us-east-1";

const credentials = {
  accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
};

export const bedrockAgent = new BedrockAgentRuntimeClient({ region, credentials });
export const s3            = new S3Client({ region, credentials });
export const sagemaker     = new SageMakerClient({ region, credentials });

export const config = {
  agentId:          process.env.BEDROCK_AGENT_ID!,
  agentAliasId:     process.env.BEDROCK_AGENT_ALIAS_ID!,
  agentModel:       process.env.BEDROCK_AGENT_MODEL ?? "Amazon Nova 1",
  bucket:           process.env.S3_BUCKET!,
  resultsPrefix:    process.env.S3_RESULTS_PREFIX ?? "results/latest/",
  sagemakerRoleArn: process.env.SAGEMAKER_ROLE_ARN!,
  sagemakerImage:   process.env.SAGEMAKER_IMAGE_URI!,
};
