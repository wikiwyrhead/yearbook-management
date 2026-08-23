import { createMiddleware } from "@tanstack/react-start";

// In LocalDev mode with DATA_BACKEND=local, native HTTP cookies (milestone_session) are used.
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    return next();
  },
);
