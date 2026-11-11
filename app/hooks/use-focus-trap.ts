"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type FocusTrapOptions = {
  /** Element focused when the trap activates; defaults to the container. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Element focused when the trap deactivates; defaults to the element that
   *  was focused before activation. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * Keeps Tab/Shift+Tab inside `containerRef` while `active` and restores focus
 * when the trap deactivates. Escape handling stays with the caller so a dialog
 * can mark the event as handled (`preventDefault`) before other document
 * listeners react to it.
 */
export function useFocusTrap<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  active: boolean,
  { initialFocusRef, restoreFocusRef }: FocusTrapOptions = {},
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const restoreTarget = restoreFocusRef?.current ?? previousFocus;
    (initialFocusRef?.current ?? container).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      const outside = !current || !container.contains(current);

      if (event.shiftKey) {
        // Shift+Tab from the dialog itself would otherwise walk back out of it.
        if (outside || current === first || current === container) {
          event.preventDefault();
          last.focus();
        }
      } else if (outside || current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      restoreTarget?.focus();
    };
  }, [active, containerRef, initialFocusRef, restoreFocusRef]);
}
