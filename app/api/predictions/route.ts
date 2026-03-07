import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { s3, config } from "@/lib/aws";

export const runtime = "nodejs";
export const revalidate = 300;

async function fetchJSON(key: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  return JSON.parse(await res.Body!.transformToString());
}

export async function GET() {
  try {
    const prefix = config.resultsPrefix;
    const [capacity, predictions, metrics, correlation] = await Promise.all([
      fetchJSON(`${prefix}hospital_capacity.json`),
      fetchJSON(`${prefix}predictions_random_forest.json`),
      fetchJSON(`${prefix}model_metrics.json`),
      fetchJSON(`${prefix}correlation_results.json`),
    ]);

    return NextResponse.json(
      { capacity, predictions, metrics, correlation },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
    );

  } catch (err: any) {
    console.error("[/api/predictions] Error:", err.message);
    return NextResponse.json(
      { error: "Pipeline results not yet available. Run a full analysis first." },
      { status: 200 }
    );
  }
}
