import { GetObjectCommand } from "@aws-sdk/client-s3";
import { InvokeAgentCommand, InvokeAgentCommandOutput } from "@aws-sdk/client-bedrock-agent-runtime";
import { CreateProcessingJobCommand, ProcessingS3DataType, ProcessingS3InputMode, ProcessingS3UploadMode } from "@aws-sdk/client-sagemaker";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { bedrockAgent, s3, sagemaker, config } from "@/lib/aws";

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

// ─── Check data freshness ─────────────────────────────────────────────────────

async function getDataFreshness(): Promise<{ isStale: boolean; ageMinutes: number; lastRun: string }> {
  const status = await fetchS3JSON(`${config.resultsPrefix}pipeline_status.json`);
  if (!status?.generated_at) {
    return { isStale: true, ageMinutes: Infinity, lastRun: "Never" };
  }
  const lastRunTime = new Date(status.generated_at).getTime();
  const now = Date.now();
  const ageMinutes = Math.floor((now - lastRunTime) / (1000 * 60));
  const isStale = ageMinutes > 120; // Stale if older than 2 hours
  return { isStale, ageMinutes, lastRun: status.generated_at };
}

// ─── Auto-trigger pipeline ────────────────────────────────────────────────────

async function triggerPipelineJob(): Promise<{ success: boolean; jobName?: string; error?: string }> {
  try {
    const jobName = `surge-shield-auto-${Date.now()}-${randomBytes(3).toString("hex")}`;
    await sagemaker.send(new CreateProcessingJobCommand({
      ProcessingJobName: jobName,
      ProcessingResources: {
        ClusterConfig: {
          InstanceCount: 1,
          InstanceType: "ml.m5.xlarge",
          VolumeSizeInGB: 20,
        },
      },
      AppSpecification: {
        ImageUri: config.sagemakerImage,
        ContainerEntrypoint: ["python3", "/opt/ml/processing/code/run_pipeline.py"],
      },
      ProcessingInputs: [
        {
          InputName: "code",
          S3Input: {
            S3Uri: `s3://${config.bucket}/code/run_pipeline.py`,
            LocalPath: "/opt/ml/processing/code",
            S3DataType: ProcessingS3DataType.S3_PREFIX,
            S3InputMode: ProcessingS3InputMode.FILE,
          },
        },
        {
          InputName: "dengue-data",
          S3Input: {
            S3Uri: `s3://${config.bucket}/raw/`,
            LocalPath: "/opt/ml/processing/input",
            S3DataType: ProcessingS3DataType.S3_PREFIX,
            S3InputMode: ProcessingS3InputMode.FILE,
          },
        },
      ],
      ProcessingOutputConfig: {
        Outputs: [{
          OutputName: "results",
          S3Output: {
            S3Uri: `s3://${config.bucket}/results/latest/`,
            LocalPath: "/opt/ml/processing/output",
            S3UploadMode: ProcessingS3UploadMode.END_OF_JOB,
          },
        }],
      },
      Environment: {
        DATA_BUCKET: config.bucket,
        RESULTS_BUCKET: config.bucket,
        RESULTS_PREFIX: "results/latest/",
        FILTER_DISTRICT: "all",
        FILTER_WEEK: "all",
      },
      RoleArn: config.sagemakerRoleArn,
    }));
    return { success: true, jobName };
  } catch (err: any) {
    console.error("[/api/agent] Pipeline trigger failed:", err.message);
    return { success: false, error: err.message };
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

    // Check data freshness
    const freshness = await getDataFreshness();
    const dataContext = await buildDataContext();

    // System prompt with freshness awareness
    const enrichedInput = `
=== SYSTEM INSTRUCTIONS ===
You are SurgeShield AI, a dengue outbreak command assistant optimized for cost efficiency.

** DATA STATUS **
- Last pipeline run: ${freshness.lastRun} (${freshness.ageMinutes === Infinity ? "Never" : `${freshness.ageMinutes} minutes ago`})
- Data status: ${freshness.isStale ? "STALE — recommend refreshing for predictions" : "FRESH"}
- Available data: Hospital capacity, ML predictions, model metrics are present below

** CRITICAL RESPONSE RULES **
ALWAYS follow this sequence:

1. **FIRST: Answer immediately** using the provided data below
   - For capacity/status questions: Use current S3 data directly
   - For forecast/prediction questions: ALWAYS provide insights from available ML predictions data below
   - Analyze and provide specific numbers, trends, and recommendations

2. **THEN: Handle data staleness**
   - If data is STALE (>2 hours old) and question is about predictions/forecasts/analysis:
     * Add this to your response with small font: "However, I'm triggering fresh analysis to ensure you get the most up-to-date predictions. Latest data will be available in ~5-10 minutes."
     * Respond with small fonts: "STALE_TRIGGER_PIPELINE" at the end (will auto-trigger fresh analysis)
   - If data is STALE but question is routine (capacity, alerts): Just provide current data, no refresh needed

3. **ONLY if truly insufficient data:**
   - If the provided data is completely empty/missing (not just stale):
     * Respond with: "INSUFFICIENT_DATA_TRIGGER_PIPELINE" (will auto-trigger)

** IMPORTANT: NEVER skip analysis just because data is stale. ALWAYS provide your best answer using available data FIRST, then note freshness. **

=== LIVE SURGESHIELD DATA (use this to answer the question below) ===
${dataContext}
=== END DATA ===

Officer's question: ${message.trim()}
`.trim();

    const command = new InvokeAgentCommand({
      agentId: config.agentId,
      agentAliasId: config.agentAliasId,
      sessionId: effectiveSessionId,
      inputText: enrichedInput,
    });

    const response = await bedrockAgent.send(command);

    // Collect streamed chunks
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let fullText = "";
    
    for await (const event of response.completion ?? []) {
      if (event.chunk?.bytes) {
        fullText += decoder.decode(event.chunk.bytes, { stream: true });
      }
    }
    fullText += decoder.decode();

    // Detect if agent requested fresh data
    const needsInsufficientData = fullText.includes("INSUFFICIENT_DATA_TRIGGER_PIPELINE");
    const needsStaleTrigger = fullText.includes("STALE_TRIGGER_PIPELINE");
    let autoTriggered = false;
    let pipelineJobName = "";
    let finalResponse = fullText;

    // Auto-trigger pipeline if agent indicated insufficient data OR needs fresh data due to staleness
    if ((needsInsufficientData || needsStaleTrigger) && freshness.ageMinutes > 5) {
      const pipelineResult = await triggerPipelineJob();
      if (pipelineResult.success) {
        autoTriggered = true;
        pipelineJobName = pipelineResult.jobName || "";
        
        // Clean up response - remove trigger markers and keep answer
        finalResponse = fullText
          .replace("INSUFFICIENT_DATA_TRIGGER_PIPELINE", "")
          .replace("STALE_TRIGGER_PIPELINE", "")
          .trim() || "Analysis triggered. Fetching fresh data...";
        
        // Add auto-trigger notification only if still needed
        if (!finalResponse.includes("auto") && !finalResponse.includes("trigger")) {
          finalResponse += `\n\n**[AUTO-TRIGGERED]** Fresh analysis has been automatically triggered (Job: ${pipelineJobName}). New predictions will be available in approximately 5-10 minutes.`;
        }
      }
    } else if (needsInsufficientData || needsStaleTrigger) {
      // If too recent, just clean markers without triggering (avoid duplicate triggers)
      finalResponse = fullText
        .replace("INSUFFICIENT_DATA_TRIGGER_PIPELINE", "")
        .replace("STALE_TRIGGER_PIPELINE", "")
        .trim();
    }

    const elapsedTime = Date.now() - startTime;
    const elapsedSeconds = (elapsedTime / 1000).toFixed(2);

    const logContext = {
      sessionId: response.sessionId,
      queryLength,
      responseLength: finalResponse.length,
      elapsedMs: elapsedTime,
      elapsedSeconds,
      autoTriggered,
      dataFreshness: `${freshness.ageMinutes}min`,
    };

    if (elapsedTime >= 30000) {
      console.error("[/api/agent] CRITICAL: Query exceeded 30-second timeout", logContext);
    } else if (autoTriggered) {
      console.log("[/api/agent] Auto-triggered pipeline", logContext);
    } else if (elapsedTime >= 25000) {
      console.warn("[/api/agent] WARNING: Slow query approaching timeout", logContext);
    } else {
      console.log("[/api/agent] Query completed", logContext);
    }

    return NextResponse.json({
      response: finalResponse || "No response from agent.",
      sessionId: response.sessionId,
      autoTriggered,
      pipelineJobName,
      dataAge: freshness.ageMinutes,
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