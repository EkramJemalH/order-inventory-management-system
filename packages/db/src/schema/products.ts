import { pgTable, uuid, varchar, text, numeric, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { categories } from "./categories";

// Product status: Active (offered) or Archived (historical record preserved)
export const productStatusEnum = pgEnum("product_status", ["ACTIVE", "ARCHIVED"]);

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  sku: varchar("sku", { length: 50 }).notNull().unique(),
  barcode: varchar("barcode", { length: 100 }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  unitOfMeasure: varchar("unit_of_measure", { length: 30 }).default("pcs").notNull(),
  retailPrice: numeric("retail_price", { precision: 10, scale: 2 }).notNull(),
  defaultWholesalePrice: numeric("default_wholesale_price", { precision: 10, scale: 2 }).notNull(),
  // Moving weighted-average cost price (updated dynamically with each supplier receipt)
  costPrice: numeric("cost_price", { precision: 10, scale: 2 }).notNull().default("0.00"),
  minStockThreshold: integer("min_stock_threshold").notNull().default(10),
  status: productStatusEnum("status").default("ACTIVE").notNull(),
  // Ethiopian Tax & VAT support (Standard 15% VAT or 0% / exempt)
  isTaxable: boolean("is_taxable").default(true).notNull(),
  taxRate: numeric("tax_rate", { precision: 4, scale: 2 }).default("0.15").notNull(),
  // Default Return Policy configured by manager
  defaultReturnPolicyAllowed: boolean("default_return_policy_allowed").default(true).notNull(),
  defaultReturnWindowDays: integer("default_return_window_days").default(7).notNull(),
  defaultReturnCondition: text("default_return_condition").default("Original packaging, unworn, tags attached"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProductEntity = typeof products.$inferSelect;
export type NewProductEntity = typeof products.$inferInsert;
