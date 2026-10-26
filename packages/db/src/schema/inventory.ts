import { pgTable, uuid, varchar, text, numeric, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { products } from "./products";
import { suppliers } from "./suppliers";
import { users } from "./users";

// Reservation status for delivery orders
export const reservationStatusEnum = pgEnum("reservation_status", [
  "ACTIVE",
  "FULFILLED",
  "RELEASED",
  "EXPIRED",
]);

// Auditable physical stock movement reasons
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "RECEIPT",
  "SALE_IN_STORE",
  "DISPATCH_DELIVERY",
  "RETURN_RESTOCK",
  "RETURN_DAMAGED",
  "ADJUSTMENT_ADD",
  "ADJUSTMENT_SUB",
  "DAMAGE_FOUND",
]);

// 1. Single Shop/Warehouse Current Balances per Product
export const inventoryBalances = pgTable("inventory_balances", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .unique()
    .references(() => products.id, { onDelete: "cascade" }),
  // Good physical stock includes units physically in shop (both available and reserved)
  goodPhysicalQuantity: integer("good_physical_quantity").notNull().default(0),
  // Reserved for confirmed delivery orders (subset of good physical stock)
  reservedQuantity: integer("reserved_quantity").notNull().default(0),
  // Physically present but damaged/unsellable
  damagedQuantity: integer("damaged_quantity").notNull().default(0),
  // Returned goods awaiting staff inspection
  pendingInspectionQuantity: integer("pending_inspection_quantity").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 2. Stock Receipts Header (Deliveries from Suppliers)
export const stockReceipts = pgTable("stock_receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptNumber: varchar("receipt_number", { length: 50 }).notNull().unique(),
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id, { onDelete: "restrict" }),
  receivedBy: uuid("received_by").references(() => users.id, { onDelete: "set null" }),
  receiptDate: timestamp("receipt_date", { withTimezone: true }).defaultNow().notNull(),
  totalCost: numeric("total_cost", { precision: 10, scale: 2 }).notNull().default("0.00"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 3. Stock Receipt Line Items (Individual products on the receipt)
export const stockReceiptItems = pgTable("stock_receipt_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptId: uuid("receipt_id")
    .notNull()
    .references(() => stockReceipts.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  quantityReceived: integer("quantity_received").notNull(),
  damagedQuantityReceived: integer("damaged_quantity_received").notNull().default(0),
  unitCost: numeric("unit_cost", { precision: 10, scale: 2 }).notNull(),
  subtotalCost: numeric("subtotal_cost", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 4. Stock Reservations (Allocations committed to delivery orders)
export const inventoryReservations = pgTable("inventory_reservations", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull(), // Linked to orders table
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  status: reservationStatusEnum("status").default("ACTIVE").notNull(),
  reservedAt: timestamp("reserved_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
});

// 5. Stock Movements (Immutable audit ledger of physical changes)
export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  type: stockMovementTypeEnum("type").notNull(),
  quantityDelta: integer("quantity_delta").notNull(), // signed: +50 or -4
  physicalStockBefore: integer("physical_stock_before").notNull(),
  physicalStockAfter: integer("physical_stock_after").notNull(),
  referenceType: varchar("reference_type", { length: 50 }), // 'stock_receipt', 'order', 'return', 'manual_adjustment'
  referenceId: uuid("reference_id"),
  reason: text("reason"),
  performedBy: uuid("performed_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type InventoryBalanceEntity = typeof inventoryBalances.$inferSelect;
export type NewInventoryBalanceEntity = typeof inventoryBalances.$inferInsert;
export type StockReceiptEntity = typeof stockReceipts.$inferSelect;
export type NewStockReceiptEntity = typeof stockReceipts.$inferInsert;
export type StockReceiptItemEntity = typeof stockReceiptItems.$inferSelect;
export type NewStockReceiptItemEntity = typeof stockReceiptItems.$inferInsert;
export type InventoryReservationEntity = typeof inventoryReservations.$inferSelect;
export type NewInventoryReservationEntity = typeof inventoryReservations.$inferInsert;
export type StockMovementEntity = typeof stockMovements.$inferSelect;
export type NewStockMovementEntity = typeof stockMovements.$inferInsert;
