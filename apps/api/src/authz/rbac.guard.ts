import { Elysia } from "elysia";
import type { UserRole } from "@repo/validation";
import { sessionPlugin } from "./session.middleware";
import type { AuthUser } from "./types";

export const authzPlugin = new Elysia({ name: "authzPlugin" })
  .use(sessionPlugin)
  .macro(({ onBeforeHandle }) => ({
    requireAuth(enabled: boolean) {
      if (!enabled) return;
      onBeforeHandle(({ user, set }: { user: AuthUser | null; set: any }) => {
        if (!user) {
          set.status = 401;
          return { success: false, error: "Authentication required" };
        }
        if (user.status !== "ACTIVE") {
          set.status = 403;
          return { success: false, error: "Account is inactive. Please contact your manager." };
        }
      });
    },
    requireRoles(roles: UserRole[]) {
      onBeforeHandle(({ user, set }: { user: AuthUser | null; set: any }) => {
        if (!user) {
          set.status = 401;
          return { success: false, error: "Authentication required" };
        }
        if (user.status !== "ACTIVE") {
          set.status = 403;
          return { success: false, error: "Account is inactive. Please contact your manager." };
        }
        if (!roles.includes(user.role)) {
          set.status = 403;
          return {
            success: false,
            error: `Forbidden: User role '${user.role}' is not authorized. Required: [${roles.join(", ")}]`,
          };
        }
      });
    },
  }));

export function checkRole(user: AuthUser | null, allowedRoles: UserRole[]): boolean {
  if (!user || user.status !== "ACTIVE") return false;
  return allowedRoles.includes(user.role);
}
