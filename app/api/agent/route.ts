import { GetObjectCommand } from "@aws-sdk/client-s3";
import { InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { NextRequest, NextResponse } from "next/server";
import { bedrockAgent, s3, config } from "@/lib/aws";

export const runtime = "nodejs";
export const maxDuration = 30;

// ─── S3 helpers ───────────────────────────────────────────────────────────────

async function fetchS3JSON(key: string): Promise<any | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    return JSON.parse(await res.Body!.transformToString());
  } catch {
    return null;
  }
}

// ─── Build context block injected before the user's question ─────────────────

async function buildDataContext(): Promise<string> {
  const prefix = config.resultsPrefix;

  const [capacity, predictions, metrics, status] = await Promise.all([
    fetchS3JSON(`${prefix}hospital_capacity.json`),
    fetchS3JSON(`${prefix}predictions_random_forest.json`),
    fetchS3JSON(`${prefix}model_metrics.json`),
    fetchS3JSON(`${prefix}pipeline_status.json`),
  ]);

  const lines: string[] = [];

  // ── Pipeline freshness ──
  if (status?.generated_at) {
    lines.push(`[DATA FRESHNESS] Pipeline last run: ${status.generated_at}`);
  } else {
    lines.push(`[DATA FRESHNESS] Pipeline status unknown — data may be stale.`);
  }

  // ── Hospital capacity ──
  const districts: any[] = capacity?.districts ?? [];
  if (districts.length > 0) {
    lines.push("\n[HOSPITAL CAPACITY — LIVE DATA]");
    lines.push("district | stress_level | avg_cases | max_cases | total_beds | icu_beds | platelet_stock | available_staff | cases_per_bed");
    for (const d of districts) {
      lines.push(
        `${d.district} | ${d.stress_level} | ${d.avg_cases} | ${d.max_cases} | ${d.total_beds} | ${d.icu_beds} | ${d.platelet_stock} | ${d.available_staff} | ${d.cases_per_bed}`
      );
    }
  } else {
    lines.push("\n[HOSPITAL CAPACITY] No live data available — pipeline may not have run yet.");
  }

  // ── Predictions ──
  const preds: any[] = predictions?.district_predictions ?? predictions?.predictions ?? [];
  if (preds.length > 0) {
    lines.push("\n[ML PREDICTIONS — RANDOM FOREST]");
    lines.push("district | pred_7day | pred_14day | rainfall_mm | temp_c | humidity_pct");
    for (const p of preds) {
      lines.push(
        `${p.district} | ${p.pred_7day ?? p.prediction_7d ?? "—"} | ${p.pred_14day ?? p.prediction_14d ?? "—"} | ${p.rainfall_mm ?? "—"} | ${p.temperature_c ?? "—"} | ${p.humidity_pct ?? "—"}`
      );
    }
  } else {
    lines.push("\n[ML PREDICTIONS] No forecast data available.");
  }

  // ── Model metrics ──
  const modelList: any[] = metrics?.models ?? [];
  if (modelList.length > 0) {
    lines.push("\n[MODEL PERFORMANCE]");
    lines.push("model | MAE | RMSE | R2");
    for (const m of modelList) {
      lines.push(`${m.name} | ${m.mae} | ${m.rmse} | ${m.r2}${m.best ? " ← best" : ""}`);
    }
  }

  return lines.join("\n");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let effectiveSessionId = "";
  let queryLength = 0;

  try {
    const { message, sessionId } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    queryLength = message.trim().length;
    effectiveSessionId = sessionId || `surgeshield-${Date.now()}`;

    // Fetch live data and inject as context ahead of the user's question
    const dataContext = await buildDataContext();

    const enrichedInput = `
=== LIVE SURGESHIELD DATA (use this to answer the question below) ===
${dataContext}
=== END DATA ===

Officer's question: ${message.trim()}
`.trim();

    const command = new InvokeAgentCommand({
      agentId:      config.agentId,
      agentAliasId: config.agentAliasId,
      sessionId:    effectiveSessionId,
      inputText:    enrichedInput,
    });

    const response = await bedrockAgent.send(command);

    // Collect streamed chunks efficiently
    // Use a single TextDecoder with stream:true to handle multi-byte UTF-8 characters
    // that may be split across chunk boundaries
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let fullText = "";
    
    for await (const event of response.completion ?? []) {
      if (event.chunk?.bytes) {
        // stream:true allows the decoder to buffer incomplete multi-byte sequences
        fullText += decoder.decode(event.chunk.bytes, { stream: true });
      }
    }
    
    // Final decode call with stream:false to flush any remaining buffered bytes
    fullText += decoder.decode();

    const elapsedTime = Date.now() - startTime;
    const elapsedSeconds = (elapsedTime / 1000).toFixed(2);

    // Log response time with context
    const logContext = {
      sessionId: response.sessionId,
      queryLength,
      responseLength: fullText.length,
      elapsedMs: elapsedTime,
      elapsedSeconds,
    };

    // Flag slow queries
    if (elapsedTime >= 30000) {
      console.error("[/api/agent] CRITICAL: Query exceeded 30-second timeout", logContext);
    } else if (elapsedTime >= 25000) {
      console.warn("[/api/agent] WARNING: Slow query approaching timeout", logContext);
    } else {
      console.log("[/api/agent] Query completed", logContext);
    }

    return NextResponse.json({
      response:  fullText || "No response from agent.",
      sessionId: response.sessionId,
    });

  } catch (err: any) {
    const elapsedTime = Date.now() - startTime;
    const elapsedSeconds = (elapsedTime / 1000).toFixed(2);

    console.error("[/api/agent] Error:", {
      error: err.message,
      sessionId: effectiveSessionId,
      queryLength,
      elapsedMs: elapsedTime,
      elapsedSeconds,
    });

    return NextResponse.json(
      { error: err.message ?? "Agent call failed" },
      { status: 500 }
    );
  }
}