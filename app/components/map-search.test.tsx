import { describe, expect, test } from "bun:test";
import { isTypingTarget } from "./MapSearch";

const element = (tagName: string, extra: Record<string, unknown> = {}) =>
  ({ tagName, ...extra }) as unknown as EventTarget;

describe("isTypingTarget", () => {
  test("treats text inputs, textareas and selects as typing targets", () => {
    expect(isTypingTarget(element("INPUT"))).toBe(true);
    expect(isTypingTarget(element("TEXTAREA"))).toBe(true);
    // "s" inside a <select> jumps to an option; it must not open search.
    expect(isTypingTarget(element("SELECT"))).toBe(true);
  });

  test("treats contentEditable hosts as typing targets", () => {
    expect(isTypingTarget(element("DIV", { isContentEditable: true }))).toBe(true);
  });

  test("leaves buttons, links and missing targets alone", () => {
    expect(isTypingTarget(element("BUTTON"))).toBe(false);
    expect(isTypingTarget(element("DIV"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
