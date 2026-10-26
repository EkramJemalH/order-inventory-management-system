import { relations } from "drizzle-orm";
import { users } from "./users";
import { categories } from "./categories";
import { suppliers } from "./suppliers";
import { products } from "./products";
import {
  inventoryBalances,
  stockReceipts,
  stockReceiptItems,
  inventoryReservations,
  stockMovements,
} from "./inventory";
import { customers } from "./customers";
import { orders, orderItems } from "./orders";
import { payments } from "./payments";
import { returns, returnItems, refunds } from "./returns";
import { auditEvents } from "./audit";

// Users Relations
export const usersRelations = relations(users, ({ many }) => ({
  ordersCreated: many(orders),
  paymentsReceived: many(payments),
  stockReceiptsReceived: many(stockReceipts),
  stockMovementsPerformed: many(stockMovements),
  returnsInspected: many(returns),
  refundsProcessed: many(refunds),
  auditEvents: many(auditEvents),
}));

// Categories Relations (Hierarchical parent/child & products)
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_hierarchy",
  }),
  children: many(categories, {
    relationName: "category_hierarchy",
  }),
  products: many(products),
}));

// Suppliers Relations
export const suppliersRelations = relations(suppliers, ({ many }) => ({
  stockReceipts: many(stockReceipts),
}));

// Products Relations
export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  inventoryBalance: one(inventoryBalances, {
    fields: [products.id],
    references: [inventoryBalances.productId],
  }),
  receiptItems: many(stockReceiptItems),
  reservations: many(inventoryReservations),
  movements: many(stockMovements),
  orderItems: many(orderItems),
  returnItems: many(returnItems),
}));

// Inventory Balances Relations
export const inventoryBalancesRelations = relations(inventoryBalances, ({ one }) => ({
  product: one(products, {
    fields: [inventoryBalances.productId],
    references: [products.id],
  }),
}));

// Stock Receipts Relations
export const stockReceiptsRelations = relations(stockReceipts, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [stockReceipts.supplierId],
    references: [suppliers.id],
  }),
  receivedByStaff: one(users, {
    fields: [stockReceipts.receivedBy],
    references: [users.id],
  }),
  items: many(stockReceiptItems),
}));

// Stock Receipt Items Relations
export const stockReceiptItemsRelations = relations(stockReceiptItems, ({ one }) => ({
  receipt: one(stockReceipts, {
    fields: [stockReceiptItems.receiptId],
    references: [stockReceipts.id],
  }),
  product: one(products, {
    fields: [stockReceiptItems.productId],
    references: [products.id],
  }),
}));

// Inventory Reservations Relations
export const inventoryReservationsRelations = relations(inventoryReservations, ({ one }) => ({
  order: one(orders, {
    fields: [inventoryReservations.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [inventoryReservations.productId],
    references: [products.id],
  }),
}));

// Stock Movements Relations
export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, {
    fields: [stockMovements.productId],
    references: [products.id],
  }),
  performedByStaff: one(users, {
    fields: [stockMovements.performedBy],
    references: [users.id],
  }),
}));

// Customers Relations
export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}));

// Orders Relations
export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  createdByStaff: one(users, {
    fields: [orders.createdBy],
    references: [users.id],
  }),
  items: many(orderItems),
  payments: many(payments),
  reservations: many(inventoryReservations),
  returns: many(returns),
  refunds: many(refunds),
}));

// Order Items Relations
export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  returnItems: many(returnItems),
}));

// Payments Relations
export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  receivedByStaff: one(users, {
    fields: [payments.receivedBy],
    references: [users.id],
  }),
}));

// Returns Relations
export const returnsRelations = relations(returns, ({ one, many }) => ({
  order: one(orders, {
    fields: [returns.orderId],
    references: [orders.id],
  }),
  inspectedByStaff: one(users, {
    fields: [returns.inspectedBy],
    references: [users.id],
  }),
  items: many(returnItems),
  refunds: many(refunds),
}));

// Return Items Relations
export const returnItemsRelations = relations(returnItems, ({ one }) => ({
  returnRequest: one(returns, {
    fields: [returnItems.returnId],
    references: [returns.id],
  }),
  orderItem: one(orderItems, {
    fields: [returnItems.orderItemId],
    references: [orderItems.id],
  }),
  product: one(products, {
    fields: [returnItems.productId],
    references: [products.id],
  }),
}));

// Refunds Relations
export const refundsRelations = relations(refunds, ({ one }) => ({
  returnRequest: one(returns, {
    fields: [refunds.returnId],
    references: [returns.id],
  }),
  order: one(orders, {
    fields: [refunds.orderId],
    references: [orders.id],
  }),
  processedByStaff: one(users, {
    fields: [refunds.processedBy],
    references: [users.id],
  }),
}));

// Audit Events Relations
export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  user: one(users, {
    fields: [auditEvents.userId],
    references: [users.id],
  }),
}));
