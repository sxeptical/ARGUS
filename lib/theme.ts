/**
 * Shared theme plumbing for the dark/light switch.
 *
 * Kept free of browser APIs at module scope so the server layout can import
 * the init script string, while client code owns reading and writing state.
 */

export type Theme = "dark" | "light";

/**
 * localStorage key. Values are stored as JSON (`"dark"` / `"light"`) to match
 * the `lib/local-history` JSON storage helpers.
 */
export const THEME_STORAGE_KEY = "argus:theme";

export function parseTheme(stored: unknown): Theme | undefined {
  return stored === "light" || stored === "dark" ? stored : undefined;
}

/**
 * Inline script run before first paint (see `app/layout.tsx`): it applies the
 * stored theme to `<html data-theme>` before any CSS-dependent content draws,
 * so a stored light theme never flashes dark first. Anything but `"light"`
 * leaves the document at the dark default.
 */
export const THEME_INIT_SCRIPT = `try{var t=JSON.parse(localStorage.getItem("${THEME_STORAGE_KEY}"));if(t==="light")document.documentElement.setAttribute("data-theme","light");}catch(e){}`;
