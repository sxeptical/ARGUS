import { BadRequestError, ForbiddenError } from "@/lib/errors";
import {
  FEEDBACK_BODY_MAX_BYTES,
  FEEDBACK_COUNTRY,
  FeedbackSubmissionSchema,
} from "@/lib/feedback";
import { saveFeedback } from "@/lib/feedback-store";
import { handle } from "@/lib/route-utils";
import { visitorCountry } from "@/lib/visitor-country";

/** Whether this visitor is offered the feedback form (Singapore only). */
export async function GET(request: Request) {
  return handle(
    request,
    "feedback-eligibility",
    { maxRequests: 120, serviceLabel: "Feedback" },
    () => ({ eligible: visitorCountry(request) === FEEDBACK_COUNTRY }),
  );
}

async function readSubmission(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > FEEDBACK_BODY_MAX_BYTES) {
    throw new BadRequestError({ message: "Feedback is too long" });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new BadRequestError({ message: "Feedback must be JSON" });
  }
  const parsed = FeedbackSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestError({
      message: "Feedback needs a rating from 1 to 5 and a comment of at most 2000 characters",
    });
  }
  return parsed.data;
}

export async function POST(request: Request) {
  return handle(
    request,
    "feedback",
    { maxRequests: 60, serviceLabel: "Feedback" },
    async (signal) => {
      // The form is hidden elsewhere, but the endpoint enforces it too.
      const country = visitorCountry(request);
      if (country !== FEEDBACK_COUNTRY) {
        throw new ForbiddenError({
          message: "Feedback is only open to visitors in Singapore",
        });
      }
      const submission = await readSubmission(request);
      await saveFeedback({ ...submission, country }, signal);
      return { ok: true };
    },
  );
}
