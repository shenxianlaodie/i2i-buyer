import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "i2i-studio",
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
