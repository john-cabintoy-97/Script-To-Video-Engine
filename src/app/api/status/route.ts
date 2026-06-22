import { NextRequest, NextResponse } from "next/server";
import type { ApiErrorResponse, StatusResponse } from "@/lib/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

/**
 * GET /api/status?id=VIDEO_ID
 *
 * Polls the Python worker for job progress. The frontend calls this every
 * 3 seconds until status becomes "completed" or "failed".
 */
export async function GET(request: NextRequest) {
  if (!BACKEND_URL) {
    return NextResponse.json<ApiErrorResponse>(
      { error: "NEXT_PUBLIC_BACKEND_URL is not configured on the server." },
      { status: 500 },
    );
  }

  // Sanitize the input parameter completely to extract the pure UUID text string
  const rawId = request.nextUrl.searchParams.get("id") || "";
  const videoId = rawId.trim().replace(/['"']/g, ""); // Strips hidden enclosing quotes if any leaked

  if (!videoId) {
    return NextResponse.json<ApiErrorResponse>(
      { error: "Query parameter 'id' is required." },
      { status: 400 },
    );
  }

  // Quick client-side check to confirm it matches standard UUID structure
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(videoId)) {
    return NextResponse.json<ApiErrorResponse>(
      { error: `The provided id format is invalid: ${videoId}` },
      { status: 400 },
    );
  }

  try {
    // Construct target URL using explicit string sanitization
    const cleanTargetUrl = `${BACKEND_URL.replace(/\/+$/, "")}/api/status/${videoId}`;
    const workerResponse = await fetch(
      cleanTargetUrl,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      },
    );

    const contentType = workerResponse.headers.get("content-type") || "";

    // --- DEFENSIVE CHECK: Intercept HTML/Text errors before trying to parse JSON ---
    if (!workerResponse.ok || !contentType.includes("application/json")) {
      const rawText = await workerResponse.text().catch(() => "Unreadable worker response.");
      const cleanSnippet = rawText.substring(0, 200).trim();
      
      console.error(`[Worker Status Error] Target: ${cleanTargetUrl} | Status: ${workerResponse.status}`, rawText);

      return NextResponse.json<ApiErrorResponse>(
        { 
          error: `Worker unexpected response format (${workerResponse.status}). Output snippet: ${cleanSnippet}`
        },
        { status: workerResponse.status === 200 ? 502 : workerResponse.status },
      );
    }

    const data = (await workerResponse.json()) as StatusResponse;

    return NextResponse.json<StatusResponse>({
      video_id: data.video_id ?? videoId,
      status: data.status ?? "processing",
      progress: data.progress,
      step: data.step,
      video_url: data.video_url,
      error: data.error,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error contacting worker.";

    console.error("[Next.js API Status Catch Block] Connection failed:", error);

    return NextResponse.json<ApiErrorResponse>(
      { error: `Failed to fetch job status: ${message}` },
      { status: 502 },
    );
  }
}

// Simple helper inside Next.js to strip trailing slashes safely from absolute environment strings
// if your .env file defines NEXT_PUBLIC_BACKEND_URL with an ending symbol
declare global {
  interface String {
    rstrip(val: string): string;
  }
}

String.prototype.rstrip = function(val: string): string {
  return this.endsWith(val) ? this.slice(0, -val.length) : String(this);
};