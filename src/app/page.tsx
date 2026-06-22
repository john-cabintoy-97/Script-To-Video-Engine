"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApiErrorResponse,
  GenerateResponse,
  StatusResponse,
  VoiceProfile,
} from "@/lib/types";

/** UI phases for the dashboard state machine. */
type DashboardPhase = "idle" | "processing" | "completed" | "failed";

const POLL_INTERVAL_MS = 3_000;

const LOADING_STEPS = [
  "Parsing script hooks...",
  "Sourcing b-roll media...",
  "Compiling voice over...",
  "Rendering captions via FFmpeg...",
] as const;

const VOICE_PROFILES: { value: VoiceProfile; label: string }[] = [
  { value: "documentary-male", label: "Documentary — Male (Default)" },
  { value: "documentary-female", label: "Documentary — Female" },
  { value: "warm-narrator", label: "Warm Narrator — Storytelling" },
];

export default function DashboardPage() {
  const [script, setScript] = useState("");
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>("documentary-male");
  const [phase, setPhase] = useState<DashboardPhase>("idle");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Clears all active polling / animation timers. */
  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  /** Polls the Next.js status proxy until the job finishes or fails. */
  const startPolling = useCallback(
    (id: string) => {
      clearTimers();

      const poll = async () => {
        try {
          const response = await fetch(`/api/status?id=${encodeURIComponent(id)}`);
          const payload = (await response.json()) as StatusResponse | ApiErrorResponse;

          if (!response.ok) {
            const err = payload as ApiErrorResponse;
            throw new Error(err.error ?? "Status check failed.");
          }

          const status = payload as StatusResponse;

          if (typeof status.progress === "number") {
            setProgress(Math.min(100, Math.max(0, status.progress)));
          }

          if (status.status === "completed" && status.video_url) {
            clearTimers();
            setVideoUrl(status.video_url);
            setProgress(100);
            setPhase("completed");
            return;
          }

          if (status.status === "failed") {
            clearTimers();
            setErrorMessage(status.error ?? "Video production failed on the worker.");
            setPhase("failed");
          }
        } catch (error) {
          clearTimers();
          setErrorMessage(
            error instanceof Error ? error.message : "Lost connection while polling status.",
          );
          setPhase("failed");
        }
      };

      // Immediate first check, then every 3 seconds.
      void poll();
      pollTimerRef.current = setInterval(() => {
        void poll();
      }, POLL_INTERVAL_MS);

      // Cycle through animated loading step labels.
      stepTimerRef.current = setInterval(() => {
        setLoadingStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
      }, 2_500);
    },
    [clearTimers],
  );

  /** Submits the script to /api/generate and begins status polling. */
  const handleGenerate = async () => {
    const trimmed = script.trim();

    if (!trimmed) {
      setErrorMessage("Paste a narration script before generating.");
      return;
    }

    setPhase("processing");
    setErrorMessage(null);
    setVideoUrl(null);
    setVideoId(null);
    setProgress(8);
    setLoadingStepIndex(0);

   try {
      // 1. Get the Railway backend base URL (falls back to localhost for local testing)
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:7860";

      // 2. Use the template literal to point directly to your Railway endpoint
      const response = await fetch(`${BACKEND_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: trimmed, voiceProfile }),
      });

      const payload = (await response.json()) as GenerateResponse | ApiErrorResponse;

      if (!response.ok) {
        const err = payload as ApiErrorResponse;
        throw new Error(err.error ?? "Generation request failed.");
      }

      const data = payload as GenerateResponse;
      setVideoId(data.video_id);
      startPolling(data.video_id);
    } catch (error) {
      clearTimers();
      setErrorMessage(
        error instanceof Error ? error.message : "Unexpected error starting production.",
      );
      setPhase("failed");
    }
  };

  /** Resets the dashboard for a new production run. */
  const handleReset = () => {
    clearTimers();
    setPhase("idle");
    setVideoId(null);
    setProgress(0);
    setVideoUrl(null);
    setErrorMessage(null);
    setLoadingStepIndex(0);
  };

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const isProcessing = phase === "processing";
  const isCompleted = phase === "completed";
  const isFailed = phase === "failed";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <header className="mb-8 text-center">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.25em] text-slate-500">
            Faceless YouTube Automation
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Script-To-Video Engine{" "}
            <span className="text-emerald-400">v1.0</span>
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Paste your narration script. The Python worker handles everything else.
          </p>
        </header>

        {/* Main card */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
          {/* Script input — hidden while processing */}
          {!isProcessing && !isCompleted && (
            <>
              <label htmlFor="script" className="mb-2 block text-sm font-medium text-slate-300">
                Narration Script
              </label>
              <textarea
                id="script"
                rows={14}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Paste your raw YouTube narration script here..."
                className="mb-6 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                disabled={isProcessing}
              />

              {/* Advanced voice profiling */}
              <div className="mb-8">
                <label
                  htmlFor="voice-profile"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Voice Profile{" "}
                  <span className="font-normal text-slate-500">(Advanced)</span>
                </label>
                <select
                  id="voice-profile"
                  value={voiceProfile}
                  onChange={(e) => setVoiceProfile(e.target.value as VoiceProfile)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  {VOICE_PROFILES.map((profile) => (
                    <option key={profile.value} value={profile.value}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Processing overlay */}
          {isProcessing && (
            <div
              className="mb-6 rounded-xl border border-slate-800 bg-slate-950/60 p-8"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <div className="mb-6 flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
                <p className="animate-pulse-glow text-sm font-medium text-emerald-400">
                  {LOADING_STEPS[loadingStepIndex]}
                </p>
              </div>

              {/* Timeline progress bar */}
              <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700 ease-out"
                  style={{ width: `${Math.max(progress, 5)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Job ID: {videoId ?? "—"}</span>
                <span>{Math.round(progress)}%</span>
              </div>
            </div>
          )}

          {/* Inline validation / error state */}
          {errorMessage && (
            <div
              className="mb-6 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          {/* Completed — video player card */}
          {isCompleted && videoUrl && (
            <div className="mb-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              <video
                src={videoUrl}
                controls
                className="aspect-video w-full bg-black"
                preload="metadata"
              >
                Your browser does not support embedded video playback.
              </video>
              <div className="flex flex-col gap-3 border-t border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-400">Production complete</p>
                  <p className="text-xs text-slate-500">Job ID: {videoId}</p>
                </div>
                <a
                  href={videoUrl}
                  download
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                >
                  Download MP4
                </a>
              </div>
            </div>
          )}

          {/* Primary action */}
          {!isProcessing && !isCompleted && !isFailed && (
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!script.trim()}
              className="w-full rounded-xl bg-emerald-500 py-4 text-base font-bold tracking-wide text-slate-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Generate Video Production
            </button>
          )}

          {(isCompleted || isFailed) && (
            <button
              type="button"
              onClick={handleReset}
              className="w-full rounded-xl border border-slate-700 py-3 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-600"
            >
              Start New Production
            </button>
          )}
        </section>

        <p className="mt-6 text-center text-xs text-slate-600">
          Rendering runs on an external Python worker — this dashboard never blocks on FFmpeg.
        </p>
      </div>
    </main>
  );
}
