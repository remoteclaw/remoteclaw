import { describe, expect, it, vi } from "vitest";
import { runGatewayHttpRequestStages } from "./server-http.js";

describe("runGatewayHttpRequestStages", () => {
  it("returns true when a stage handles the request", async () => {
    const stages = [
      { name: "a", run: () => false },
      { name: "b", run: () => true },
      { name: "c", run: () => false },
    ];
    expect(await runGatewayHttpRequestStages(stages)).toBe(true);
  });

  it("returns false when no stage handles the request", async () => {
    const stages = [
      { name: "a", run: () => false },
      { name: "b", run: () => false },
    ];
    expect(await runGatewayHttpRequestStages(stages)).toBe(false);
  });

  it("skips a throwing stage marked continueOnError and continues to subsequent stages", async () => {
    const stageC = vi.fn(() => true);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const stages = [
      { name: "a", run: () => false },
      {
        name: "broken-facade",
        continueOnError: true,
        run: () => {
          throw new Error("Cannot find module '@slack/bolt'");
        },
      },
      { name: "c", run: stageC },
    ];

    const result = await runGatewayHttpRequestStages(stages);

    expect(result).toBe(true);
    expect(stageC).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('stage "broken-facade" threw'),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("skips a rejecting async stage marked continueOnError and continues", async () => {
    const stageC = vi.fn(() => true);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const stages = [
      {
        name: "async-broken",
        continueOnError: true,
        run: async () => {
          throw new Error("ERR_MODULE_NOT_FOUND");
        },
      },
      { name: "c", run: stageC },
    ];

    const result = await runGatewayHttpRequestStages(stages);

    expect(result).toBe(true);
    expect(stageC).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('stage "async-broken" threw'),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("skips a throwing stage and continues so later stages stay reachable", async () => {
    // The runner catches every stage error and skips to the next stage (it does
    // not honour a `continueOnError` flag — neither the fork nor upstream prod
    // distinguishes the two). A plugin-facade load failure must not 500 the
    // whole gateway; later stages (control-ui, gateway-probes) stay reachable.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stages = [
      {
        name: "broken",
        run: () => {
          throw new Error("load failed");
        },
      },
      { name: "unmatched", run: () => false },
    ];

    const result = await runGatewayHttpRequestStages(stages);

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('stage "broken" threw'),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});
