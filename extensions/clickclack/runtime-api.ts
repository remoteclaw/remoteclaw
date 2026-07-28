// Keep the bundled runtime entry narrow so generic runtime activation does not
// import the broad ClickClack API barrel (and transitively `ws`) just to install
// runtime state.
export { setClickClackRuntime } from "./src/runtime.js";
