"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useFocusTrap } from "@/app/hooks/use-focus-trap";
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_PROMPT_KEY,
  parseFeedbackPromptState,
  shouldPromptFeedback,
  type FeedbackPromptState,
} from "@/lib/feedback";
import { readStoredJson, writeStoredJson } from "@/lib/local-history";

const RATINGS = [1, 2, 3, 4, 5] as const;

/** "intro" invites a first-time visitor to try the app; "form" asks for the rating. */
type FeedbackView = "intro" | "form";

async function fetchEligibility(): Promise<boolean> {
  try {
    const response = await fetch("/api/feedback", { cache: "no-store" });
    if (!response.ok) return false;
    const payload = (await response.json()) as { eligible?: unknown };
    return payload.eligible === true;
  } catch {
    return false;
  }
}

const readPromptState = (): FeedbackPromptState =>
  parseFeedbackPromptState(readStoredJson(FEEDBACK_PROMPT_KEY));

const updatePromptState = (patch: Partial<FeedbackPromptState>) =>
  writeStoredJson(FEEDBACK_PROMPT_KEY, { ...readPromptState(), ...patch });

/** Never pop up over another dialog (e.g. focus mode). */
const anotherDialogIsOpen = () =>
  document.querySelector('[aria-modal="true"]') !== null;

/**
 * Feedback form for visitors in Singapore (the server decides who is
 * eligible). It opens by itself on a first visit and when the visitor comes
 * back after a while. A first-time visitor has nothing to rate yet, so they
 * only get a short invitation to try the app; returning visitors get the form.
 * Once closed it stays tucked against the top edge of the screen, centred, as a
 * small tab that reopens it.
 */
export default function FeedbackWidget() {
  const [eligible, setEligible] = useState(false);
  const [view, setView] = useState<FeedbackView | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchEligibility().then((isEligible) => {
      if (cancelled || !isEligible) return;
      setEligible(true);
      const state = readPromptState();
      if (shouldPromptFeedback(state, Date.now()) && !anotherDialogIsOpen()) {
        setView(state.lastSeenAt === null ? "intro" : "form");
      }
      updatePromptState({ lastSeenAt: Date.now() });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!eligible) return;

    const markSeen = () => updatePromptState({ lastSeenAt: Date.now() });
    const handleVisibilityChange = () => {
      // Coming back to a tab left in the background counts as a return visit.
      if (
        !document.hidden &&
        shouldPromptFeedback(readPromptState(), Date.now()) &&
        !anotherDialogIsOpen()
      ) {
        setView("form");
      }
      markSeen();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", markSeen);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", markSeen);
    };
  }, [eligible]);

  if (!eligible) return null;

  if (view) {
    return (
      <FeedbackDialog
        view={view}
        onShowForm={() => setView("form")}
        onClose={() => setView(null)}
        onSubmitted={() => updatePromptState({ submittedAt: Date.now() })}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setView("form")}
      // Phones have no free space in the header, so the tab takes its own row
      // above it (sticky while scrolling); wider screens float it over the gap
      // in the middle of the header.
      className="sticky top-[env(safe-area-inset-top)] z-40 -mt-2 inline-flex self-center sm:fixed sm:left-1/2 sm:mt-0 sm:-translate-x-1/2 items-center gap-2 rounded-b border border-t-0 border-line-strong bg-surface-raised px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted shadow-lg shadow-black/40 transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
    >
      <span className="status-dot text-success" aria-hidden />
      Feedback
    </button>
  );
}

function FeedbackDialog({
  view,
  onShowForm,
  onClose,
  onSubmitted,
}: {
  view: FeedbackView;
  onShowForm: () => void;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  // The dashboard re-renders on every live poll; read the latest onClose
  // through a ref so the Esc listener is set up once per open.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useFocusTrap(panelRef, true);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (rating === null || status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, message }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: unknown }
          | null;
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "Could not send feedback",
        );
      }
      onSubmitted();
      setStatus("sent");
    } catch (cause) {
      setStatus("idle");
      setError(cause instanceof Error ? cause.message : "Could not send feedback");
    }
  };

  // Once sent, show only the thank-you box: no title bar, no Esc button.
  if (status === "sent") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-[2px] sm:items-center sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-line-strong bg-surface p-5 text-xs shadow-2xl shadow-black/50 outline-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-thanks-title"
          onClick={(event) => event.stopPropagation()}
        >
          <p id="feedback-thanks-title" role="status" className="leading-relaxed text-ink">
            Thanks for your feedback, this will help improve the app further!
          </p>
          <button type="button" className="action-button mt-4 w-full" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/50 outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              Feedback
            </div>
            <h2 id="feedback-dialog-title" className="font-mono text-base font-medium text-ink">
              {view === "intro" ? "Heya!" : "How is ARGUS working for you?"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted hover:border-line-strong hover:text-ink sm:px-2 sm:py-1"
            aria-label="Close feedback"
          >
            <span className="sm:hidden">Close</span>
            <span className="hidden sm:inline">Esc</span>
          </button>
        </div>

        {view === "intro" ? (
          <div className="space-y-3 p-4 text-xs">
            <p className="leading-relaxed text-ink">
              I need your help with some feedback. Play around with the app and
              let me know what you think!
            </p>
            <p className="leading-relaxed text-muted">
              When you are ready, open the Feedback tab at the top of the screen.
            </p>
            <div className="flex gap-2">
              <button type="button" className="action-button flex-1" onClick={onShowForm}>
                Give feedback now
              </button>
              <button
                type="button"
                className="action-button action-button-primary flex-1"
                onClick={onClose}
              >
                Will do
              </button>
            </div>
          </div>
        ) : (
          <form className="space-y-4 overflow-y-auto p-4 text-xs" onSubmit={submit}>
            <fieldset>
              <legend className="data-label mb-2">Rating</legend>
              <div className="grid grid-cols-5 gap-2">
                {RATINGS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={rating === value}
                    aria-label={`${value} out of 5`}
                    onClick={() => setRating(value)}
                    className={`min-h-10 rounded-sm border font-mono text-sm transition-colors duration-150 ${
                      rating === value
                        ? "border-success bg-success-soft text-success"
                        : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-faint">
                <span>Poor</span>
                <span>Great</span>
              </div>
            </fieldset>

            <label className="block">
              <span className="data-label mb-2 block">Comments (optional)</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
                rows={4}
                placeholder="What is useful, missing or broken?"
                className="field-control resize-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </label>

            {error ? (
              <p role="alert" className="leading-relaxed text-danger">
                {error}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button type="button" className="action-button flex-1" onClick={onClose}>
                Not now
              </button>
              <button
                type="submit"
                className="action-button action-button-primary flex-1"
                disabled={rating === null || status === "sending"}
              >
                {status === "sending" ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
