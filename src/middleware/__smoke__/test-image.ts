import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to the 100x100 solid red PNG fixture. */
export const TEST_IMAGE_PATH = join(fileURLToPath(import.meta.url), "..", "test-image.png");
