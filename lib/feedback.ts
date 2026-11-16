/**
 * Visitor feedback: the submission contract shared by the form and the API
 * route, plus the rules for when the form opens by itself. Feedback is only
 * offered to visitors in Singapore (see `lib/visitor-country.ts`).
 */
import { z } from "zod";

/** ISO 3166-1 alpha-2 code of the only country offered the form. */
export const FEEDBACK_COUNTRY = "SG";

export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;

/** Upper bound on the POST body; a full-length message fits well inside it. */
export const FEEDBACK_BODY_MAX_BYTES = 16 * 1024;

export const FeedbackSubmissionSchema = z.object({
  rating: z.number().int().min(1).max(5),
  message: z
    .string()
    .trim()
    .max(FEEDBACK_MESSAGE_MAX_LENGTH)
    .optional()
    // An empty comment is stored as "no comment", not as an empty string.
    .transform((value) => value || null),
});

export type FeedbackSubmission = z.infer<typeof FeedbackSubmissionSchema>;

// ---------- When the form opens by itself ----------

export const FEEDBACK_PROMPT_KEY = "argus.feedback.prompt.v1";

/** Away for longer than this counts as coming back to the site. */
export const FEEDBACK_AWAY_MS = 30 * 60 * 1000;

/** After sending feedback the form stays tucked away for this long. */
export const FEEDBACK_SUBMITTED_QUIET_MS = 30 * 24 * 60 * 60 * 1000;

export type FeedbackPromptState = {
  /** Last time the dashboard was on screen (epoch ms). */
  readonly lastSeenAt: number | null;
  /** Last time this browser sent feedback (epoch ms). */
  readonly submittedAt: number | null;
};

export const EMPTY_FEEDBACK_PROMPT_STATE: FeedbackPromptState = {
  lastSeenAt: null,
  submittedAt: null,
};

const timestamp = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

export function parseFeedbackPromptState(stored: unknown): FeedbackPromptState {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return EMPTY_FEEDBACK_PROMPT_STATE;
  }
  const record = stored as Record<string, unknown>;
  return {
    lastSeenAt: timestamp(record.lastSeenAt),
    submittedAt: timestamp(record.submittedAt),
  };
}

/**
 * The form opens by itself on a first visit and whenever the visitor comes
 * back after being away, but not again soon after they have sent feedback.
 */
export function shouldPromptFeedback(
  state: FeedbackPromptState,
  now: number,
): boolean {
  if (
    state.submittedAt !== null &&
    now - state.submittedAt < FEEDBACK_SUBMITTED_QUIET_MS
  ) {
    return false;
  }
  return state.lastSeenAt === null || now - state.lastSeenAt > FEEDBACK_AWAY_MS;
}
