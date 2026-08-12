import { NhostClient } from "@nhost/nhost-js";

// "local" is nhost's convention for a locally-running `nhost up` stack; set NEXT_PUBLIC_NHOST_SUBDOMAIN/REGION to point at a cloud project instead.
export const nhost = new NhostClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "local",
  region: process.env.NEXT_PUBLIC_NHOST_REGION,
});
