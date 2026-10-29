import { describe, expect, test, beforeAll } from "bun:test";
import { app } from "../src/index";
import { orderPolicy, inventoryPolicy, refundPolicy } from "../src/authz/object-policies";
import { logAuditEvent } from "../src/authz/audit.service";
import { db, auditEvents, eq } from "@repo/db";

describe("Better Auth & Authorization Layer Tests", () => {
  const timestamp = Date.now();
  const testStaffEmail = `staff_${timestamp}@ethioshop.et`;
  const testAdminEmail = `admin_${timestamp}@ethioshop.et`;
  const password = "EthiopiaSecure2026!";

  let staffToken = "";
  let staffUserId = "";
  let adminToken = "";
  let adminUserId = "";

  test("1. Registers a SALES_STAFF user via Better Auth", async () => {
    const res = await app.handle(
      new Request("http://localhost:3001/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Chala Tadesse",
          email: testStaffEmail,
          password,
          role: "SALES_STAFF",
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBeDefined();
    expect(json.user.email).toBe(testStaffEmail);
    expect(json.user.role).toBe("SALES_STAFF");
    expect(json.user.status).toBe("ACTIVE");

    staffToken = json.token;
    staffUserId = json.user.id;
  });

  test("2. Registers an ADMIN user via Better Auth", async () => {
    const res = await app.handle(
      new Request("http://localhost:3001/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Selamawit Bekele",
          email: testAdminEmail,
          password,
          role: "ADMIN",
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBeDefined();
    expect(json.user.role).toBe("ADMIN");

    adminToken = json.token;
    adminUserId = json.user.id;
  });

  test("3. Authenticates and signs in with email/password", async () => {
    const res = await app.handle(
      new Request("http://localhost:3001/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testStaffEmail,
          password,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBeDefined();
    expect(json.user.id).toBe(staffUserId);
  });

  test("4. Resolves authenticated session at GET /api/v1/auth/me", async () => {
    const res = await app.handle(
      new Request("http://localhost:3001/api/v1/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.authenticated).toBe(true);
    expect(json.data.user.role).toBe("SALES_STAFF");
    expect(json.data.user.id).toBe(staffUserId);
  });

  test("5. Rejects unauthenticated request at GET /api/v1/auth/me", async () => {
    const res = await app.handle(
      new Request("http://localhost:3001/api/v1/auth/me", {
        method: "GET",
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.authenticated).toBe(false);
    expect(json.data).toBeNull();
  });

  test("6. Object-Level Policy: Order cancellation rules", () => {
    const staffUser = {
      id: staffUserId,
      name: "Chala",
      email: testStaffEmail,
      role: "SALES_STAFF" as const,
      status: "ACTIVE" as const,
      emailVerified: false,
    };

    const adminUser = {
      id: adminUserId,
      name: "Selam",
      email: testAdminEmail,
      role: "ADMIN" as const,
      status: "ACTIVE" as const,
      emailVerified: false,
    };

    // Rule 1: Cannot cancel if already DISPATCHED
    const dispatchedOrder = {
      createdBy: staffUserId,
      fulfilmentStatus: "DISPATCHED",
      orderStatus: "CONFIRMED",
    };
    expect(orderPolicy.canCancel(dispatchedOrder, staffUser).allowed).toBe(false);
    expect(orderPolicy.canCancel(dispatchedOrder, adminUser).allowed).toBe(false);

    // Rule 2: Staff can cancel their own PREPARING order
    const preparingOwnOrder = {
      createdBy: staffUserId,
      fulfilmentStatus: "PREPARING",
      orderStatus: "CONFIRMED",
    };
    expect(orderPolicy.canCancel(preparingOwnOrder, staffUser).allowed).toBe(true);

    // Rule 3: Staff cannot cancel another staff's order
    const preparingOtherOrder = {
      createdBy: "another-staff-uuid",
      fulfilmentStatus: "PREPARING",
      orderStatus: "CONFIRMED",
    };
    expect(orderPolicy.canCancel(preparingOtherOrder, staffUser).allowed).toBe(false);
    // But Admin CAN cancel any preparing order
    expect(orderPolicy.canCancel(preparingOtherOrder, adminUser).allowed).toBe(true);
  });

  test("7. Object-Level Policy: Inventory adjustment limits", () => {
    const staffUser = {
      id: staffUserId,
      name: "Chala",
      email: testStaffEmail,
      role: "SALES_STAFF" as const,
      status: "ACTIVE" as const,
      emailVerified: false,
    };

    const adminUser = {
      id: adminUserId,
      name: "Selam",
      email: testAdminEmail,
      role: "ADMIN" as const,
      status: "ACTIVE" as const,
      emailVerified: false,
    };

    // Staff cannot perform large stock adjustment (> 5 units)
    expect(inventoryPolicy.canAdjust(12, staffUser).allowed).toBe(false);
    // Staff can perform small stock adjustment (<= 5 units)
    expect(inventoryPolicy.canAdjust(3, staffUser).allowed).toBe(true);
    // Admin can perform large stock adjustment
    expect(inventoryPolicy.canAdjust(12, adminUser).allowed).toBe(true);
  });

  test("8. Object-Level Policy: Refund authorization", () => {
    const staffUser = {
      id: staffUserId,
      name: "Chala",
      email: testStaffEmail,
      role: "SALES_STAFF" as const,
      status: "ACTIVE" as const,
      emailVerified: false,
    };

    const adminUser = {
      id: adminUserId,
      name: "Selam",
      email: testAdminEmail,
      role: "ADMIN" as const,
      status: "ACTIVE" as const,
      emailVerified: false,
    };

    // Ordinary sales staff cannot issue refunds
    expect(refundPolicy.canIssueRefund(staffUser).allowed).toBe(false);
    // Admin can issue refunds
    expect(refundPolicy.canIssueRefund(adminUser).allowed).toBe(true);
  });

  test("9. Audit Logging: Writes immutable security audit event", async () => {
    const testAction = `TEST_AUDIT_${timestamp}`;
    await logAuditEvent({
      userId: adminUserId,
      action: testAction,
      entityType: "Product",
      entityId: "prod-test-uuid",
      oldValues: { price: 200 },
      newValues: { price: 250 },
      ipAddress: "127.0.0.1",
      userAgent: "bun-test",
    });

    const recorded = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, testAction));

    expect(recorded.length).toBe(1);
    expect(recorded[0].userId).toBe(adminUserId);
    expect(recorded[0].entityType).toBe("Product");
    expect(recorded[0].oldValues).toEqual({ price: 200 });
    expect(recorded[0].newValues).toEqual({ price: 250 });
  });
});
