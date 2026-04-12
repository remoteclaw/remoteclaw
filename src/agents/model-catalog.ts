/* eslint-disable @typescript-eslint/no-explicit-any */
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type ModelCatalogEntry = any;
export const loadModelCatalog = async (..._args: unknown[]): Promise<ModelCatalogEntry[]> => [];
export const findModelInCatalog = (..._args: any[]) => undefined as any;
export const modelSupportsVision = (..._args: any[]) => false;
