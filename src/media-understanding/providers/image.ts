import type { ImageDescriptionRequest, ImageDescriptionResult } from "../types.js";

export async function describeImageWithModel(
  params: ImageDescriptionRequest,
): Promise<ImageDescriptionResult> {
  throw new Error(
    `describeImageWithModel is not available: model discovery has been removed (${params.provider}/${params.model})`,
  );
}
