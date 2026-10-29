import { Elysia } from "elysia";
import { auth } from "../lib/auth";
import type { AuthUser, AuthSession } from "./types";

export const sessionPlugin = new Elysia({ name: "sessionPlugin" })
  .derive({ as: "scoped" }, async ({ request }) => {
    try {
      const sessionData = await auth.api.getSession({
        headers: request.headers,
      });

      if (!sessionData) {
        return {
          user: null as AuthUser | null,
          session: null as AuthSession | null,
        };
      }

      const rawUser = sessionData.user as any;
      const user: AuthUser = {
        id: rawUser.id,
        name: rawUser.name,
        email: rawUser.email,
        role: rawUser.role || "SALES_STAFF",
        status: rawUser.status || "ACTIVE",
        emailVerified: rawUser.emailVerified,
        image: rawUser.image,
      };

      const session: AuthSession = {
        id: sessionData.session.id,
        userId: sessionData.session.userId,
        token: sessionData.session.token,
        expiresAt: sessionData.session.expiresAt,
        ipAddress: sessionData.session.ipAddress,
        userAgent: sessionData.session.userAgent,
      };

      return { user, session };
    } catch {
      return {
        user: null as AuthUser | null,
        session: null as AuthSession | null,
      };
    }
  });
