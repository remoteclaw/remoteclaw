// Keep bundled channel entry imports narrow so bootstrap/discovery paths do not
// drag ClickClack runtime/send/gateway surfaces into lightweight plugin loads.
export { clickClackPlugin } from "./src/channel.js";
