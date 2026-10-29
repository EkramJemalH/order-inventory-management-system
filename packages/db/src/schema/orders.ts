import { pgTable, uuid, varchar, text, numeric, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { users } from "./users";
import { products } from "./products";

// Order lifecycle status
export const orderStatusEnum = pgEnum("order_status", [
  "DRAFT",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
]);

// Sale type: In-store walk-in or Delivery
export const orderTypeEnum = pgEnum("order_type", ["IN_STORE", "DELIVERY"]);

// Independent payment status
export const paymentStatusEnum = pgEnum("payment_status", [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
]);

// Independent fulfilment / delivery status
export const fulfilmentStatusEnum = pgEnum("fulfilment_status", [
  "PREPARING",
  "DISPATCHED",
  "DELIVERED",
  "HANDED_OVER", // For in-store sales
  "CANCELLED",
]);

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }), // Nullable for anonymous in-store sales
  orderType: orderTypeEnum("order_type").default("IN_STORE").notNull(),
  status: orderStatusEnum("status").default("DRAFT").notNull(),
  paymentStatus: paymentStatusEnum("payment_status").default("UNPAID").notNull(),
  fulfilmentStatus: fulfilmentStatusEnum("fulfilment_status").default("PREPARING").notNull(),
  // Financial amounts
  subtotalAmount: numeric("subtotal_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  outstandingBalance: numeric("outstanding_balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
  // Delivery details (for delivery orders)
  deliveryAddress: text("delivery_address"),
  deliveryRecipientName: varchar("delivery_recipient_name", { length: 150 }),
  deliveryRecipientPhone: varchar("delivery_recipient_phone", { length: 50 }),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  // Secure QR / link return access token
  returnToken: varchar("return_token", { length: 64 }).unique(),
  returnTokenExpiresAt: timestamp("return_token_expires_at", { withTimezone: true }),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  orderDate: timestamp("order_date", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(), // Agreed price snapshot
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  // Moving average cost snapshot at the moment of purchase (for exact COGS & gross profit)
  costPriceSnapshot: numeric("cost_price_snapshot", { precision: 10, scale: 2 }).notNull().default("0.00"),
  // Tax snapshot at the moment of purchase
  taxRateSnapshot: numeric("tax_rate_snapshot", { precision: 4, scale: 2 }).notNull().default("0.15"),
  taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  // Return policy snapshot at the time of purchase (manager changes must not rewrite historical sales)
  returnPolicyAllowedSnapshot: boolean("return_policy_allowed_snapshot").default(true).notNull(),
  returnWindowDaysSnapshot: integer("return_window_days_snapshot").default(7).notNull(),
  returnDeadline: timestamp("return_deadline", { withTimezone: true }), // Calculated from purchase or delivery date
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type OrderEntity = typeof orders.$inferSelect;
export type NewOrderEntity = typeof orders.$inferInsert;
export type OrderItemEntity = typeof orderItems.$inferSelect;
export type NewOrderItemEntity = typeof orderItems.$inferInsert;
