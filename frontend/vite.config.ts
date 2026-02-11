/// <reference types="vitest/config" />

import { vitePlugin as remix } from "@remix-run/dev";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

declare module "@remix-run/node" {
  interface Future {
    v3_fetcherPersist: true;
    v3_lazyRouteDiscovery: true;
    v3_relativeSplatPath: true;
    v3_singleFetch: true;
    v3_throwAbortReason: true;
  }
}

export default defineConfig({
    plugins: [
        remix({
            future: {
                v3_fetcherPersist: true,
                v3_lazyRouteDiscovery: true,
                v3_relativeSplatPath: true,
                v3_singleFetch: true,
                v3_throwAbortReason: true,
            },
        }),
        tsconfigPaths(),
    ],
    test: {
        environment: "node",
        include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
    },
});
