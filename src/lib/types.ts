/** Shared types for the script-to-video pipeline. */

export type VoiceProfile = "documentary-male" | "documentary-female" | "warm-narrator";

export type JobStatus = "processing" | "completed" | "failed";

export interface GenerateRequestBody {
  script: string;
  voiceProfile: VoiceProfile;
}

export interface GenerateResponse {
  video_id: string;
  status: JobStatus;
}

export interface StatusResponse {
  video_id: string;
  status: JobStatus;
  /** 0–100 progress percentage reported by the Python worker. */
  progress?: number;
  /** Human-readable step label from the worker (optional). */
  step?: string;
  /** Final MP4 URL once status is "completed". */
  video_url?: string;
  /** Error message when status is "failed". */
  error?: string;
}

export interface ApiErrorResponse {
  error: string;
}
