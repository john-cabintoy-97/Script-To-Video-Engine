import { NextRequest, NextResponse } from "next/server";
import type { ApiErrorResponse, GenerateRequestBody, GenerateResponse } from "@/lib/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

/**
 * POST /api/generate
 *
 * Lightweight proxy — forwards the narration script to the external Python
 * FastAPI worker and immediately returns a { video_id, status: "processing" }
 * ticket. No FFmpeg or asset work happens on Vercel.
 */
export async function POST(request: NextRequest) {
  if (!BACKEND_URL) {
    return NextResponse.json<ApiErrorResponse>(
      { error: "NEXT_PUBLIC_BACKEND_URL is not configured on the server." },
      { status: 500 },
    );
  }

  let body: GenerateRequestBody;

  try {
    body = (await request.json()) as GenerateRequestBody;
  } catch {
    return NextResponse.json<ApiErrorResponse>(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const script = body.script?.trim();
  const voiceProfile = body.voiceProfile ?? "documentary-male";

  if (!script) {
    return NextResponse.json<ApiErrorResponse>(
      { error: "Script text is required." },
      { status: 400 },
    );
  }

  if (script.length > 50_000) {
    return NextResponse.json<ApiErrorResponse>(
      { error: "Script exceeds the 50,000 character limit." },
      { status: 400 },
    );
  }

  try {
    const workerResponse = await fetch(`${BACKEND_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script, voice_profile: voiceProfile }),
      // Do not wait for video rendering — the worker must respond quickly.
      signal: AbortSignal.timeout(60_000),
    });

    if (!workerResponse.ok) {
      const detail = await workerResponse.text().catch(() => "Unknown worker error.");
      return NextResponse.json<ApiErrorResponse>(
        { error: `Worker rejected the job: ${detail}` },
        { status: workerResponse.status },
      );
    }

    const data = (await workerResponse.json()) as GenerateResponse;

    if (!data.video_id) {
      return NextResponse.json<ApiErrorResponse>(
        { error: "Worker response missing video_id." },
        { status: 502 },
      );
    }

    return NextResponse.json<GenerateResponse>({
      video_id: data.video_id,
      status: data.status ?? "processing",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error contacting worker.";

    return NextResponse.json<ApiErrorResponse>(
      { error: `Failed to reach video worker: ${message}` },
      { status: 502 },
    );
  }
}
