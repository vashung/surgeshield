import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { s3, config } from "@/lib/aws";

export const runtime = "nodejs";
export const revalidate = 300;

async function fetchJSON(key: string) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    return JSON.parse(await res.Body!.transformToString());
  } catch (err: any) {
    // Return null for missing files instead of throwing
    if (err.name === 'NoSuchKey') {
      console.warn(`[/api/predictions] File not found: ${key}`);
      return null;
    }
    throw err;
  }
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

    // Only include available data
    const result: any = {};
    if (capacity) result.capacity = capacity;
    if (predictions) result.predictions = predictions;
    if (metrics) result.metrics = metrics;
    if (correlation) result.correlation = correlation;

    // If no data available, indicate pipeline hasn't run
    if (Object.keys(result).length === 0) {
      return NextResponse.json(
        { error: "Pipeline results not yet available. Run a full analysis first.", available: false },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { ...result, available: true },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
    );

  } catch (err: any) {
    console.error("[/api/predictions] Error:", err.message);
    return NextResponse.json(
      { error: "Pipeline results not yet available. Run a full analysis first.", available: false },
      { status: 200 }
    );
  }
}
