import { NhostClient } from "@nhost/nhost-js";

// `subdomain: "local"` is nhost's own convention for talking to a locally-running
// `nhost up` stack; point NEXT_PUBLIC_NHOST_SUBDOMAIN/REGION at a cloud project to
// use that instead.
export const nhost = new NhostClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "local",
  region: process.env.NEXT_PUBLIC_NHOST_REGION,
});
