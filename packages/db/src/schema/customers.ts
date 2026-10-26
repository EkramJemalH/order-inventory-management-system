import { pgTable, uuid, varchar, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const customerTypeEnum = pgEnum("customer_type", ["RETAIL", "WHOLESALE"]);

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 50 }),
  companyName: varchar("company_name", { length: 150 }),
  taxNumber: varchar("tax_number", { length: 50 }),
  type: customerTypeEnum("type").default("RETAIL").notNull(),
  creditLimit: numeric("credit_limit", { precision: 10, scale: 2 }).default("0.00"),
  creditTermsDays: text("credit_terms_days"), // e.g. "Net 30" or "15"
  address: text("address"),
  city: varchar("city", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CustomerEntity = typeof customers.$inferSelect;
export type NewCustomerEntity = typeof customers.$inferInsert;
