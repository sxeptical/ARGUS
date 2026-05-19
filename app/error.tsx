"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#020913] px-4 text-terminal-text">
      <div className="rounded-md border border-red-400/30 bg-[#04111e]/95 p-8 text-center shadow-[0_0_44px_rgba(255,60,60,0.16)]">
        <h1 className="mb-2 text-lg font-semibold text-red-300">Dashboard Fault</h1>
        <p className="mb-6 terminal-dim text-sm">A rendering error interrupted the signal surface.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-6 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20"
        >
          Reinitialise
        </button>
      </div>
    </div>
  );
}
