/**
 * Feedback persistence in Neon Postgres. Uses Neon's HTTP driver, which runs
 * on Workers and Node alike (one fetch per query, no connection to manage).
 * The table is created by `scripts/sql/feedback.sql`.
 */
import { neon } from "@neondatabase/serverless";
import { ExternalApiError } from "@/lib/errors";
import type { FeedbackSubmission } from "@/lib/feedback";

const getDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new ExternalApiError({
      service: "feedback",
      message: "Missing DATABASE_URL",
      status: 401,
    });
  }
  return url;
};

export async function saveFeedback(
  feedback: FeedbackSubmission & { country: string },
  signal?: AbortSignal,
): Promise<void> {
  const sql = neon(getDatabaseUrl(), { fetchOptions: { signal } });
  try {
    await sql`
      INSERT INTO feedback (rating, message, country)
      VALUES (${feedback.rating}, ${feedback.message}, ${feedback.country})
    `;
  } catch (error) {
    if (signal?.aborted) throw error;
    // Log the cause server-side; the client only learns it is unavailable.
    console.error("[feedback] insert failed", error);
    throw new ExternalApiError({
      service: "feedback",
      message: "Feedback insert failed",
      status: 503,
    });
  }
}
