// Covers best-effort network discovery display helpers.
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeNetworkInterfacesSnapshot } from "../test-helpers/network-interfaces.js";
import {
  inspectBestEffortPrimaryTailnetIPv4,
  pickBestEffortPrimaryLanIPv4,
  resolveBestEffortGatewayBindHostForDisplay,
} from "./network-discovery-display.js";

describe("network discovery display", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockInterfaceDiscoveryThrows(message = "interface discovery failed") {
    vi.spyOn(os, "networkInterfaces").mockImplementation(() => {
      throw new Error(message);
    });
  }

  describe("pickBestEffortPrimaryLanIPv4", () => {
    it("returns the primary LAN IPv4 when discovery succeeds", () => {
      vi.spyOn(os, "networkInterfaces").mockReturnValue(
        makeNetworkInterfacesSnapshot({
          lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
          en0: [{ address: "192.168.1.50", family: "IPv4" }],
        }),
      );

      expect(pickBestEffortPrimaryLanIPv4()).toBe("192.168.1.50");
    });

    it("returns undefined when interface discovery throws", () => {
      mockInterfaceDiscoveryThrows();

      expect(pickBestEffortPrimaryLanIPv4()).toBeUndefined();
    });
  });

  describe("inspectBestEffortPrimaryTailnetIPv4", () => {
    it("returns the primary tailnet IPv4 without a warning when discovery succeeds", () => {
      vi.spyOn(os, "networkInterfaces").mockReturnValue(
        makeNetworkInterfacesSnapshot({
          utun1: [{ address: "100.88.1.5", family: "IPv4" }],
        }),
      );

      expect(inspectBestEffortPrimaryTailnetIPv4()).toEqual({ tailnetIPv4: "100.88.1.5" });
    });

    it("formats a prefixed warning when discovery throws", () => {
      mockInterfaceDiscoveryThrows();

      expect(inspectBestEffortPrimaryTailnetIPv4({ warningPrefix: "tailnet check" })).toEqual({
        tailnetIPv4: undefined,
        warning: "tailnet check: interface discovery failed.",
      });
    });

    it("omits the warning when discovery throws but no prefix is provided", () => {
      mockInterfaceDiscoveryThrows();

      expect(inspectBestEffortPrimaryTailnetIPv4()).toEqual({ tailnetIPv4: undefined });
    });
  });

  describe("resolveBestEffortGatewayBindHostForDisplay", () => {
    it("falls back to the tailnet loopback host with a warning when discovery throws", async () => {
      mockInterfaceDiscoveryThrows();

      const result = await resolveBestEffortGatewayBindHostForDisplay({
        bindMode: "tailnet",
        warningPrefix: "bind check",
      });

      expect(result).toEqual({
        bindHost: "127.0.0.1",
        warning: "bind check: interface discovery failed.",
      });
    });
  });
});
