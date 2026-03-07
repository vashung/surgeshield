import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { s3, config } from "@/lib/aws";

export const runtime = "nodejs";

export async function GET() {
  try {
    const res = await s3.send(new GetObjectCommand({
      Bucket: config.bucket,
      Key:    `${config.resultsPrefix}pipeline_status.json`,
    }));
    const data = JSON.parse(await res.Body!.transformToString());
    return NextResponse.json({ connected: true, model: "Claude 3.5 Sonnet", ...data });
  } catch (err: any) {
    // Check if it's just a missing file (NoSuchKey) or an actual connection error
    if (err.name === 'NoSuchKey') {
      console.warn("[/api/status] Pipeline status file not found. Pipeline may not have run yet.");
      return NextResponse.json({ 
        connected: true,
        success: false,
        generated_at: null,
        model: "Claude 3.5 Sonnet",
        message: "Pipeline not yet run"
      });
    }
    
    // Real connection/auth error
    console.error("[/api/status] AWS Connection Error:", err.message);
    return NextResponse.json({ 
      connected: false, 
      success: false, 
      generated_at: null, 
      model: "Claude 3.5 Sonnet",
      error: err.message 
    });
  }
}
