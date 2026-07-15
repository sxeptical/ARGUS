"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-paper text-ink">
        <div className="grid min-h-dvh place-items-center px-4">
          <div className="w-full max-w-md border border-line bg-surface p-6 sm:p-8">
            <div className="mb-5 flex items-center gap-2 text-danger">
              <span className="status-dot" aria-hidden="true" />
              <span className="data-label text-danger">Critical error</span>
            </div>
            <h1 className="mb-2 text-xl font-semibold">ARGUS unavailable</h1>
            <p className="mb-6 text-sm leading-relaxed text-muted">
              The signal monitor encountered an unrecoverable error.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="action-button action-button-primary"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
