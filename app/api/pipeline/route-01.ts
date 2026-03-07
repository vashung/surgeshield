import {
  CreateProcessingJobCommand,
  ProcessingS3DataType,
  ProcessingS3InputMode,
  ProcessingS3UploadMode,
} from "@aws-sdk/client-sagemaker";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { sagemaker, config } from "@/lib/aws";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { district = "all", week = "all" } = await req.json().catch(() => ({}));

    const jobName = `surge-shield-${Date.now()}-${randomBytes(3).toString("hex")}`;

    await sagemaker.send(new CreateProcessingJobCommand({
      ProcessingJobName: jobName,
      ProcessingResources: {
        ClusterConfig: {
          InstanceCount:  1,
          InstanceType:   "ml.m5.xlarge",
          VolumeSizeInGB: 20,
        },
      },
      AppSpecification: {
        ImageUri:           config.sagemakerImage,
        ContainerEntrypoint: ["python3", "/opt/ml/processing/code/run_pipeline.py"],
      },
      ProcessingInputs: [
        {
          InputName: "code",
          S3Input: {
            S3Uri:       `s3://${config.bucket}/code/run_pipeline.py`,
            LocalPath:   "/opt/ml/processing/code",
            S3DataType:  ProcessingS3DataType.S3_PREFIX,
            S3InputMode: ProcessingS3InputMode.FILE,
          },
        },
        {
          InputName: "dengue-data",
          S3Input: {
            S3Uri:       `s3://${config.bucket}/raw/`,
            LocalPath:   "/opt/ml/processing/input",
            S3DataType:  ProcessingS3DataType.S3_PREFIX,
            S3InputMode: ProcessingS3InputMode.FILE,
          },
        },
      ],
      ProcessingOutputConfig: {
        Outputs: [{
          OutputName: "results",
          S3Output: {
            S3Uri:          `s3://${config.bucket}/results/latest/`,
            LocalPath:      "/opt/ml/processing/output",
            S3UploadMode:   ProcessingS3UploadMode.END_OF_JOB,
          },
        }],
      },
      Environment: {
        DATA_BUCKET:      config.bucket,
        RESULTS_BUCKET:   config.bucket,
        RESULTS_PREFIX:   "results/latest/",
        FILTER_DISTRICT:  district,
        FILTER_WEEK:      week,
      },
      RoleArn: config.sagemakerRoleArn,
    }));

    return NextResponse.json({ jobName, status: "InProgress", message: "Pipeline started. Results available in ~5 minutes." });

  } catch (err: any) {
    console.error("[/api/pipeline] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
