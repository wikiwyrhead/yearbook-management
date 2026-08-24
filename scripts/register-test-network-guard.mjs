// scripts/register-test-network-guard.mjs
import { installFailClosedNetworkGuard } from "./test-db-guard.mjs";

// Automatically activate fail-closed network interceptor when preloaded via NODE_OPTIONS
installFailClosedNetworkGuard();
