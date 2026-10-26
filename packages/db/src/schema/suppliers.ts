import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const suppliers = pgTable("suppliers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  contactPerson: varchar("contact_person", { length: 150 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SupplierEntity = typeof suppliers.$inferSelect;
export type NewSupplierEntity = typeof suppliers.$inferInsert;
