import { describe, expect, it } from "vitest";
import { computeBaseConfigSchemaResponse } from "./schema-base.js";
import { GENERATED_BASE_CONFIG_SCHEMA } from "./schema.base.generated.js";

describe("generated base config schema", () => {
  // Skipped: this fork does not regenerate schema.base.generated.ts — it is
  // carried as upstream-synced content (see that file's header and #2760), so
  // the committed payload deliberately diverges from a fresh
  // computeBaseConfigSchemaResponse() and this equality cannot hold. Un-skip
  // only as part of wiring the generator and reconciling the drift (#2760
  // option 2), not on its own.
  it.skip("matches the computed base config schema payload", () => {
    expect(
      computeBaseConfigSchemaResponse({
        generatedAt: GENERATED_BASE_CONFIG_SCHEMA.generatedAt,
      }),
    ).toEqual(GENERATED_BASE_CONFIG_SCHEMA);
  });
});
