import { describe, expect, test } from "bun:test";
import {
  buildBrowserNotifications,
  DEFAULT_NOTIFICATION_PREFS,
  diffSignals,
  mergeActiveSignals,
  selectNotifiable,
} from "@/lib/notifications";
import type { SignalRow } from "@/lib/signals";

const signal = (
  id: string,
  category: SignalRow["category"] = "road",
  tone: SignalRow["tone"] = "danger",
): SignalRow => ({ id, category, tone, text: `text ${id}` });

const ALL_LOADED = { rail: true, road: true, weather: true };

describe("diffSignals", () => {
  test("records a baseline on a category's first load without alerting", () => {
    const { fresh, seen } = diffSignals({}, [signal("a"), signal("b")], ALL_LOADED);
    expect(fresh).toEqual([]);
    expect(seen.road).toEqual(["a", "b"]);
  });

  test("reports only signals missing from the last check", () => {
    const { fresh, seen } = diffSignals(
      { road: ["a"] },
      [signal("a"), signal("b")],
      ALL_LOADED,
    );
    expect(fresh.map((row) => row.id)).toEqual(["b"]);
    expect(seen.road).toEqual(["a", "b"]);
  });

  test("is idempotent for unchanged signals", () => {
    const first = diffSignals({ road: [] }, [signal("a")], ALL_LOADED);
    const second = diffSignals(first.seen, [signal("a")], ALL_LOADED);
    expect(first.fresh).toHaveLength(1);
    expect(second.fresh).toEqual([]);
  });

  test("leaves an unloaded category untouched, then baselines it on recovery", () => {
    const whileFailing = diffSignals(
      { rail: ["r"] },
      [],
      { rail: true, road: false, weather: false },
    );
    expect(whileFailing.seen.road).toBeUndefined();
    expect(whileFailing.seen.weather).toBeUndefined();

    const recovered = diffSignals(whileFailing.seen, [signal("a")], ALL_LOADED);
    expect(recovered.fresh).toEqual([]);
    expect(recovered.seen.road).toEqual(["a"]);
  });

  test("keeps a failed feed's seen ids so its signals don't alert again", () => {
    const failing = diffSignals(
      { road: ["a"] },
      [],
      { rail: true, road: false, weather: true },
    );
    expect(failing.seen.road).toEqual(["a"]);
    expect(diffSignals(failing.seen, [signal("a")], ALL_LOADED).fresh).toEqual([]);
  });

  test("alerts again when a cleared signal returns", () => {
    const cleared = diffSignals({ weather: ["p"] }, [], ALL_LOADED);
    const returned = diffSignals(
      cleared.seen,
      [signal("p", "weather")],
      ALL_LOADED,
    );
    expect(returned.fresh.map((row) => row.id)).toEqual(["p"]);
  });

  test("orders new signals by priority and collapses duplicate ids", () => {
    const { fresh } = diffSignals(
      { rail: [], road: [], weather: [] },
      [
        signal("a", "road"),
        signal("r", "rail"),
        signal("r", "rail"),
        signal("p", "weather"),
      ],
      ALL_LOADED,
    );
    expect(fresh.map((row) => row.id)).toEqual(["r", "p", "a"]);
  });
});

describe("selectNotifiable", () => {
  const inScope = (...ids: string[]) => new Set(ids);

  test("limits road alerts to accidents", () => {
    const fresh = [signal("crash"), signal("breakdown", "road", "warning")];
    expect(
      selectNotifiable(fresh, DEFAULT_NOTIFICATION_PREFS, inScope("crash", "breakdown")),
    ).toEqual([signal("crash")]);
  });

  test("respects a disabled category", () => {
    const fresh = [signal("r", "rail"), signal("p", "weather")];
    expect(
      selectNotifiable(
        fresh,
        { ...DEFAULT_NOTIFICATION_PREFS, rail: false },
        inScope("r", "p"),
      ),
    ).toEqual([signal("p", "weather")]);
  });

  test("skips signals outside the radius filter", () => {
    expect(
      selectNotifiable([signal("far")], DEFAULT_NOTIFICATION_PREFS, inScope()),
    ).toEqual([]);
  });
});

describe("mergeActiveSignals", () => {
  test("appends new toasts and drops cleared ones", () => {
    expect(
      mergeActiveSignals([signal("old"), signal("kept")], [signal("new")], [
        signal("kept"),
        signal("new"),
      ]),
    ).toEqual([signal("kept"), signal("new")]);
  });

  test("does not add a toast that is already showing", () => {
    expect(
      mergeActiveSignals([signal("a")], [signal("a")], [signal("a")]).map((row) => row.id),
    ).toEqual(["a"]);
  });

  test("returns the same array when nothing changed", () => {
    const current = [signal("a")];
    expect(mergeActiveSignals(current, [], [signal("a")])).toBe(current);
  });

  test("refreshes a retained row whose text changed, keeping its position", () => {
    const current = [signal("r", "rail"), signal("a")];
    const reworded = { ...signal("r", "rail"), text: "reworded" };
    const merged = mergeActiveSignals(current, [], [reworded, signal("a")]);
    expect(merged.map((row) => row.id)).toEqual(["r", "a"]);
    expect(merged[0]).toBe(reworded);
    expect(merged[1]).toBe(current[1]);
    expect(merged).not.toBe(current);
  });
});

describe("buildBrowserNotifications", () => {
  test("tags each notification with its signal id", () => {
    expect(buildBrowserNotifications([signal("r", "rail")])).toEqual([
      { tag: "r", title: "Rail disruption", body: "text r" },
    ]);
  });

  test("collapses a burst into one summary", () => {
    const burst = ["a", "b", "c", "d"].map((id) => signal(id));
    expect(buildBrowserNotifications(burst.slice(0, 3))).toHaveLength(3);
    const summary = buildBrowserNotifications(burst);
    expect(summary).toHaveLength(1);
    expect(summary[0]?.title).toBe("4 new ARGUS signals");
  });
});
