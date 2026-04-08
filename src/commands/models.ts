// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Stub: model catalog commands are not available in the middleware-only fork

// oxlint-disable-next-line no-explicit-any
export async function modelsListCommand(_opts: any, _runtime: any): Promise<void> {
  console.error("Model listing is not available in RemoteClaw (middleware-only fork).");
}

// oxlint-disable-next-line no-explicit-any
export async function modelsStatusCommand(_opts: any, _runtime: any): Promise<void> {
  console.error("Model status is not available in RemoteClaw (middleware-only fork).");
}
