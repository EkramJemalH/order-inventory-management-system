import { pgTable, uuid, varchar, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { users } from "./users";

export const paymentMethodEnum = pgEnum("payment_method", [
  "CASH",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "BANK_TRANSFER",
  "MOBILE_MONEY",
  "OTHER",
]);

export const paymentRecordStatusEnum = pgEnum("payment_record_status", [
  "PENDING",
  "COMPLETED",
  "FAILED",
]);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  method: paymentMethodEnum("method").notNull(),
  status: paymentRecordStatusEnum("status").default("COMPLETED").notNull(),
  transactionReference: varchar("transaction_reference", { length: 100 }),
  notes: text("notes"),
  receivedBy: text("received_by").references(() => users.id, { onDelete: "set null" }),
  paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PaymentEntity = typeof payments.$inferSelect;
export type NewPaymentEntity = typeof payments.$inferInsert;
