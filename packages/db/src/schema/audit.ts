import { pgTable, uuid, varchar, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(), // e.g. "ORDER_CREATED", "STOCK_ADJUSTED", "PAYMENT_RECORDED"
  entityType: varchar("entity_type", { length: 50 }).notNull(), // e.g. "Order", "Product", "Payment"
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AuditEventEntity = typeof auditEvents.$inferSelect;
export type NewAuditEventEntity = typeof auditEvents.$inferInsert;
