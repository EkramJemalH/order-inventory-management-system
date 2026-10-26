import { pgTable, uuid, varchar, text, numeric, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { orders, orderItems } from "./orders";
import { products } from "./products";
import { users } from "./users";

// Return request progress status
export const returnStatusEnum = pgEnum("return_status", [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "INSPECTED",
  "RESOLVED",
]);

// Physical disposition of the returned item after inspection
export const returnDispositionEnum = pgEnum("return_disposition", [
  "PENDING_INSPECTION",
  "RESTOCKED",
  "DAMAGED_WRITE_OFF",
  "RETURN_TO_SUPPLIER",
  "REJECTED",
]);

// Refund disbursement method
export const refundMethodEnum = pgEnum("refund_method", [
  "CASH",
  "BANK_TRANSFER",
  "ORIGINAL_PAYMENT",
  "STORE_CREDIT",
]);

export const refundStatusEnum = pgEnum("refund_status", [
  "PENDING",
  "COMPLETED",
  "FAILED",
]);

// 1. Return Request Header
export const returns = pgTable("returns", {
  id: uuid("id").defaultRandom().primaryKey(),
  returnNumber: varchar("return_number", { length: 50 }).notNull().unique(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  status: returnStatusEnum("status").default("REQUESTED").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  inspectedAt: timestamp("inspected_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  inspectedBy: uuid("inspected_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 2. Return Line Items (Individual products and quantities checked against their policy)
export const returnItems = pgTable("return_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  returnId: uuid("return_id")
    .notNull()
    .references(() => returns.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id")
    .notNull()
    .references(() => orderItems.id, { onDelete: "restrict" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  disposition: returnDispositionEnum("disposition").default("PENDING_INSPECTION").notNull(),
  refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  reason: text("reason").notNull(),
  conditionNotes: text("condition_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 3. Explicit Refund Financial Records
export const refunds = pgTable("refunds", {
  id: uuid("id").defaultRandom().primaryKey(),
  returnId: uuid("return_id")
    .references(() => returns.id, { onDelete: "set null" }),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  method: refundMethodEnum("method").notNull(),
  status: refundStatusEnum("status").default("COMPLETED").notNull(),
  transactionReference: varchar("transaction_reference", { length: 100 }),
  notes: text("notes"),
  processedBy: uuid("processed_by").references(() => users.id, { onDelete: "set null" }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ReturnEntity = typeof returns.$inferSelect;
export type NewReturnEntity = typeof returns.$inferInsert;
export type ReturnItemEntity = typeof returnItems.$inferSelect;
export type NewReturnItemEntity = typeof returnItems.$inferInsert;
export type RefundEntity = typeof refunds.$inferSelect;
export type NewRefundEntity = typeof refunds.$inferInsert;
