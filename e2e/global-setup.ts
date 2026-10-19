import { assertSafeE2ETarget } from "./guard";

/** Aborts the whole run before any spec signs in against a non-test target. */
export default function globalSetup() {
  assertSafeE2ETarget();
}
