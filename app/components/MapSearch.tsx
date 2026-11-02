"use client";

import { useEffect, useRef, useState } from "react";
import type { MapSearchResult } from "@/types";

type MapSearchProps = {
	results: MapSearchResult[];
	onSelect: (result: MapSearchResult) => void;
	/** Set while a radius filter limits `results`, e.g. "2.5 km radius". */
	scope?: string;
};

export default function MapSearch({ results, onSelect, scope }: MapSearchProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const normalizedQuery = query.trim().toLowerCase();
	const matches = normalizedQuery
		? results.filter(
				(result) =>
					result.name.toLowerCase().includes(normalizedQuery) ||
					result.keywords.some((keyword) =>
						keyword.toLowerCase().includes(normalizedQuery),
					),
			)
		: results.slice(0, 6);

	useEffect(() => {
		if (isOpen) inputRef.current?.focus();
	}, [isOpen]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const isTyping =
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.isContentEditable;

			if (!isOpen && event.key.toLowerCase() === "s" && !isTyping &&
				!event.altKey && !event.ctrlKey && !event.metaKey) {
				event.preventDefault();
				setIsOpen(true);
			} else if (isOpen && event.key === "Escape") {
				setIsOpen(false);
				setQuery("");
			}
		};
		const handlePointerDown = (event: PointerEvent) => {
			if (!panelRef.current?.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		document.addEventListener("pointerdown", handlePointerDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [isOpen]);

	const selectResult = (result: MapSearchResult) => {
		onSelect(result);
		setIsOpen(false);
		setQuery("");
	};

	return (
		<div>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				aria-label="Search map locations"
				title="Search (S)"
				className="absolute left-2 top-11 z-10 grid h-11 w-11 place-items-center border border-line bg-overlay text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink active:bg-surface-hover sm:h-9 sm:w-9"
			>
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
					<circle cx="7" cy="7" r="4.5" />
					<path d="M10.5 10.5 14 14" />
				</svg>
			</button>
			{isOpen ? (
				<div
					className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:items-center sm:p-4 backdrop-blur-[2px]"
					onClick={() => {
						setIsOpen(false);
						setQuery("");
					}}
					role="presentation"
				>
					<div
						ref={panelRef}
						className="w-full max-w-xl overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/50"
						role="dialog"
						aria-modal="true"
						aria-labelledby="map-search-title"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="flex items-center gap-3 border-b border-line px-4 py-4">
						<label htmlFor="map-search-input" className="sr-only">
							Search map locations
						</label>
						<span id="map-search-title" className="font-mono text-xs text-muted" aria-hidden="true">
							SEARCH
						</span>
						<input
							ref={inputRef}
							id="map-search-input"
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={scope ? `Search within ${scope}...` : "Search map locations..."}
							className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
						/>
						<button
							type="button"
							onClick={() => {
								setIsOpen(false);
								setQuery("");
							}}
							className="shrink-0 rounded border border-line px-3 py-2 font-mono sm:px-2 sm:py-1 text-[10px] uppercase tracking-[0.1em] text-muted hover:border-line-strong hover:text-ink"
							aria-label="Close map search"
						>
							<span className="sm:hidden">Close</span>
							<span className="hidden sm:inline">Esc</span>
						</button>
					</div>
						<div className="max-h-[min(60vh,24rem)] overflow-y-auto p-2">
						{matches.length > 0 ? matches.map((result) => (
							<button
								key={`${result.type}-${result.id}`}
								type="button"
								onClick={() => selectResult(result)}
									className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-3 text-left hover:border-line hover:bg-surface-hover"
							>
								<span className="min-w-0 truncate text-xs text-ink">{result.name}</span>
								<span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
									{result.type}
								</span>
							</button>
						)) : (
							<div className="px-3 py-5 text-center text-[10px] uppercase tracking-[0.1em] text-muted">
								{scope ? `No locations found within ${scope}` : "No locations found"}
							</div>
						)}
					</div>
				</div>
				</div>
			) : null}
		</div>
	);
}
