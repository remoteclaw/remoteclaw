import { vi } from "vitest";

vi.mock("./cdp-reachability.js", () => ({
  isCdpHttpReachable: vi.fn(async () => true),
  isCdpReady: vi.fn(async () => true),
  getCdpWebSocketUrl: vi.fn(async () => null),
}));
