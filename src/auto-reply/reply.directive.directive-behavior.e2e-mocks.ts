import { vi } from "vitest";

vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(),
}));
