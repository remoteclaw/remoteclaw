import { describe, expect, it } from "vitest";
import { makeNetworkInterfacesSnapshot } from "../test-helpers/network-interfaces.js";
import {
  listExternalInterfaceAddresses,
  pickMatchingExternalInterfaceAddress,
  readNetworkInterfaces,
  safeNetworkInterfaces,
  type NetworkInterfacesSnapshot,
} from "./network-interfaces.js";

describe("readNetworkInterfaces", () => {
  it("returns the injected provider's snapshot", () => {
    const snapshot = makeNetworkInterfacesSnapshot({
      en0: [{ address: "192.168.1.50", family: "IPv4" }],
    });
    expect(readNetworkInterfaces(() => snapshot)).toBe(snapshot);
  });
});

describe("safeNetworkInterfaces", () => {
  it("returns the snapshot when the provider succeeds", () => {
    const snapshot = makeNetworkInterfacesSnapshot({
      en0: [{ address: "192.168.1.50", family: "IPv4" }],
    });
    expect(safeNetworkInterfaces(() => snapshot)).toBe(snapshot);
  });

  it("returns undefined when the provider throws", () => {
    expect(
      safeNetworkInterfaces(() => {
        throw new Error("interface discovery failed");
      }),
    ).toBeUndefined();
  });
});

describe("listExternalInterfaceAddresses", () => {
  it("returns an empty list for an undefined snapshot", () => {
    expect(listExternalInterfaceAddresses(undefined)).toEqual([]);
  });

  it("skips internal interfaces and returns name/address/family for external ones", () => {
    const snapshot = makeNetworkInterfacesSnapshot({
      lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
      en0: [
        { address: "192.168.1.50", family: "IPv4" },
        { address: "fe80::1", family: "IPv6" },
      ],
    });

    expect(listExternalInterfaceAddresses(snapshot)).toEqual([
      { name: "en0", address: "192.168.1.50", family: "IPv4" },
      { name: "en0", address: "fe80::1", family: "IPv6" },
    ]);
  });

  it("filters by family and trims addresses, skipping blank ones", () => {
    const snapshot = makeNetworkInterfacesSnapshot({
      en0: [
        { address: "  ", family: "IPv4" },
        { address: " 10.0.0.9 ", family: "IPv4" },
        { address: "fe80::2", family: "IPv6" },
      ],
    });

    expect(listExternalInterfaceAddresses(snapshot, "IPv4")).toEqual([
      { name: "en0", address: "10.0.0.9", family: "IPv4" },
    ]);
  });

  it("normalizes numeric interface families and skips unknown ones", () => {
    // os.networkInterfaces() historically reported family as a number (4/6);
    // the module normalizes those and drops anything it cannot classify.
    const snapshot = {
      en0: [
        { address: "192.168.1.7", family: 4, internal: false },
        { address: "203.0.113.9", family: 7, internal: false },
      ],
    } as unknown as NetworkInterfacesSnapshot;

    expect(listExternalInterfaceAddresses(snapshot)).toEqual([
      { name: "en0", address: "192.168.1.7", family: "IPv4" },
    ]);
  });
});

describe("pickMatchingExternalInterfaceAddress", () => {
  const snapshot = makeNetworkInterfacesSnapshot({
    lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
    eth0: [{ address: "10.0.0.5", family: "IPv4" }],
    en0: [{ address: "192.168.1.50", family: "IPv4" }],
  });

  it("prefers addresses from preferredNames in order", () => {
    expect(
      pickMatchingExternalInterfaceAddress(snapshot, {
        family: "IPv4",
        preferredNames: ["en0", "eth0"],
      }),
    ).toBe("192.168.1.50");
  });

  it("falls back to the first external address when no preferred name matches", () => {
    expect(pickMatchingExternalInterfaceAddress(snapshot, { family: "IPv4" })).toBe("10.0.0.5");
  });

  it("applies the matches predicate", () => {
    expect(
      pickMatchingExternalInterfaceAddress(snapshot, {
        family: "IPv4",
        matches: (address) => address.startsWith("192."),
      }),
    ).toBe("192.168.1.50");
  });

  it("returns undefined when nothing matches the requested family", () => {
    expect(pickMatchingExternalInterfaceAddress(snapshot, { family: "IPv6" })).toBeUndefined();
  });
});
