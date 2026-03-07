import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { s3, config } from "@/lib/aws";

export const runtime = "nodejs";
// Revalidate every 5 minutes
export const revalidate = 300;

export async function GET() {
  try {
    const res = await s3.send(new GetObjectCommand({
      Bucket: config.bucket,
      Key:    `${config.resultsPrefix}hospital_capacity.json`,
    }));

    const data = JSON.parse(await res.Body!.transformToString());
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });

  } catch (err: any) {
    console.error("[/api/capacity] Error:", err.message);
    // Return empty structure so the UI doesn't crash
    return NextResponse.json(
      { districts: [], total_districts: 0, error: "Pipeline results not yet available. Run a full analysis first." },
      { status: 200 }
    );
  }
}
