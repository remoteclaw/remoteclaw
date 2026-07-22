// Keep bundled channel entry imports narrow so bootstrap/discovery paths do
// not drag the SMS send/status/Twilio surfaces into lightweight plugin loads.
export { smsPlugin } from "./src/channel.js";
