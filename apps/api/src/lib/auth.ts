import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { db, users, sessions, accounts, verifications } from "@repo/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  plugins: [bearer()],
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",
  secret: process.env.BETTER_AUTH_SECRET || "order-inventory-mgmt-auth-secret-key-etb-2026",
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "SALES_STAFF",
        input: true,
      },
      status: {
        type: "string",
        required: false,
        defaultValue: "ACTIVE",
        input: true,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
});

export type Auth = typeof auth;
