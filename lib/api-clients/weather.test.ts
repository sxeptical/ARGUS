import { describe, expect, test } from "bun:test";
import { FetchHttpClient } from "@effect/platform";
import { Effect } from "effect";
import { CacheLive } from "@/lib/cache";
import { ExternalApiError } from "@/lib/errors";
import { getWeather } from "./weather";

const runWithFetch = (fetchImpl: typeof fetch) =>
  Effect.runPromiseExit(
    getWeather().pipe(
      Effect.provide(CacheLive),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetchImpl),
    ),
  );

describe("getWeather", () => {
  test("returns partial data when one endpoint succeeds", async () => {
    const exit = await runWithFetch(async (input) => {
      const url = String(input);
      if (url.includes("2-hour-weather-forecast")) {
        return Response.json({
          items: [
            {
              timestamp: "2026-01-01T00:00:00.000Z",
              forecasts: [{ area: "Singapore", forecast: "Cloudy" }],
            },
          ],
        });
      }
      return new Response("unavailable", { status: 503 });
    });

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value.forecast).toBe("Island-wide: Cloudy");
    expect(exit.value.temperature).toBeNull();
    expect(exit.value.humidity).toBeNull();
    expect(exit.value.psi).toBeNull();
  });

  test("fails when every weather endpoint fails", async () => {
    const exit = await runWithFetch(async () =>
      new Response("unavailable", { status: 503 }),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure" || exit.cause._tag !== "Fail") return;
    expect(exit.cause.error).toBeInstanceOf(ExternalApiError);
  });
});
