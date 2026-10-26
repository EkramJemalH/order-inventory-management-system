import { z } from "zod";

// ==========================================
// 1. Common / Pagination
// ==========================================
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// ==========================================
// 2. Users (Staff accounts, roles & auth)
// ==========================================
export const userRoleSchema = z.enum([
  "ADMIN",
  "MANAGER",
  "SALES_STAFF",
  "INVENTORY_STAFF",
]);
export const userStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const userSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(150),
  email: z.string().email(),
  role: userRoleSchema.default("SALES_STAFF"),
  status: userStatusSchema.default("ACTIVE"),
});

export const createUserSchema = userSchema.extend({
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type User = z.infer<typeof userSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// ==========================================
// 3. Categories
// ==========================================
export const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(120),
  description: z.string().optional(),
  parentId: z.string().uuid().optional().nullable(),
});

export const createCategorySchema = categorySchema.omit({ id: true });
export type Category = z.infer<typeof categorySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// ==========================================
// 4. Suppliers
// ==========================================
export const supplierSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(150),
  contactPerson: z.string().max(150).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createSupplierSchema = supplierSchema.omit({ id: true });
export type Supplier = z.infer<typeof supplierSchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

// ==========================================
// 5. Customers (Retail & Wholesale)
// ==========================================
export const customerTypeSchema = z.enum(["RETAIL", "WHOLESALE"]);

export const customerSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(150),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  companyName: z.string().max(150).optional().nullable(),
  taxNumber: z.string().max(50).optional().nullable(),
  type: customerTypeSchema.default("RETAIL"),
  creditLimit: z.number().nonnegative().default(0),
  creditTermsDays: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createCustomerSchema = customerSchema.omit({ id: true });
export type CustomerType = z.infer<typeof customerTypeSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// ==========================================
// 6. Products
// ==========================================
export const productStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);

export const productSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().min(3).max(50),
  barcode: z.string().max(100).optional().nullable(),
  name: z.string().min(2).max(200),
  description: z.string().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  unitOfMeasure: z.string().default("pcs"),
  retailPrice: z.number().positive(),
  defaultWholesalePrice: z.number().positive(),
  costPrice: z.number().nonnegative().default(0),
  minStockThreshold: z.number().int().nonnegative().default(10),
  status: productStatusSchema.default("ACTIVE"),
  isTaxable: z.boolean().default(true),
  taxRate: z.number().nonnegative().default(0.15),
  defaultReturnPolicyAllowed: z.boolean().default(true),
  defaultReturnWindowDays: z.number().int().positive().default(7),
  defaultReturnCondition: z.string().default("Original packaging, unworn, tags attached"),
});

export const createProductSchema = productSchema.omit({ id: true });
export const updateProductSchema = createProductSchema.partial();
export type ProductStatus = z.infer<typeof productStatusSchema>;
export type Product = z.infer<typeof productSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ==========================================
// 7. Inventory Balances & Reservations
// ==========================================
export const reservationStatusSchema = z.enum([
  "ACTIVE",
  "FULFILLED",
  "RELEASED",
  "EXPIRED",
]);

export const inventoryBalanceSchema = z.object({
  productId: z.string().uuid(),
  goodPhysicalQuantity: z.number().int().nonnegative(),
  reservedQuantity: z.number().int().nonnegative(),
  damagedQuantity: z.number().int().nonnegative(),
  pendingInspectionQuantity: z.number().int().nonnegative(),
});

export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type InventoryBalance = z.infer<typeof inventoryBalanceSchema>;

// ==========================================
// 8. Stock Receipts & Movements
// ==========================================
export const stockReceiptItemSchema = z.object({
  productId: z.string().uuid(),
  quantityReceived: z.number().int().positive(),
  damagedQuantityReceived: z.number().int().nonnegative().default(0),
  unitCost: z.number().positive(),
});

export const createStockReceiptSchema = z.object({
  receiptNumber: z.string().min(2),
  supplierId: z.string().uuid(),
  receiptDate: z.string().datetime().optional(),
  items: z.array(stockReceiptItemSchema).min(1, "Receipt must contain at least one product"),
  notes: z.string().optional(),
});

export const stockMovementTypeSchema = z.enum([
  "RECEIPT",
  "SALE_IN_STORE",
  "DISPATCH_DELIVERY",
  "RETURN_RESTOCK",
  "RETURN_DAMAGED",
  "ADJUSTMENT_ADD",
  "ADJUSTMENT_SUB",
  "DAMAGE_FOUND",
]);

export const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  quantityDelta: z.number().int(),
  type: stockMovementTypeSchema,
  reason: z.string().min(3),
});

export type StockReceiptItem = z.infer<typeof stockReceiptItemSchema>;
export type CreateStockReceiptInput = z.infer<typeof createStockReceiptSchema>;
export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

// ==========================================
// 9. Orders & Order Items
// ==========================================
export const orderStatusSchema = z.enum([
  "DRAFT",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
]);

export const orderTypeSchema = z.enum(["IN_STORE", "DELIVERY"]);

export const paymentStatusSchema = z.enum([
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
]);

export const fulfilmentStatusSchema = z.enum([
  "PREPARING",
  "DISPATCHED",
  "DELIVERED",
  "HANDED_OVER",
  "CANCELLED",
]);

export const orderItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

export const createOrderSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  orderType: orderTypeSchema.default("IN_STORE"),
  items: z.array(orderItemInputSchema).min(1, "Order must contain at least one item"),
  discountAmount: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  deliveryAddress: z.string().optional(),
  deliveryRecipientName: z.string().optional(),
  deliveryRecipientPhone: z.string().optional(),
  notes: z.string().optional(),
});

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderType = z.infer<typeof orderTypeSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type FulfilmentStatus = z.infer<typeof fulfilmentStatusSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ==========================================
// 10. Payments
// ==========================================
export const paymentMethodSchema = z.enum([
  "CASH",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "BANK_TRANSFER",
  "MOBILE_MONEY",
  "OTHER",
]);

export const recordPaymentSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  method: paymentMethodSchema,
  transactionReference: z.string().max(100).optional(),
  notes: z.string().optional(),
});

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// ==========================================
// 11. Returns, Inspection & Refunds
// ==========================================
export const returnStatusSchema = z.enum([
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "INSPECTED",
  "RESOLVED",
]);

export const returnDispositionSchema = z.enum([
  "PENDING_INSPECTION",
  "RESTOCKED",
  "DAMAGED_WRITE_OFF",
  "RETURN_TO_SUPPLIER",
  "REJECTED",
]);

export const returnItemInputSchema = z.object({
  orderItemId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  reason: z.string().min(3),
});

export const requestReturnSchema = z.object({
  orderId: z.string().uuid(),
  returnToken: z.string().optional(),
  items: z.array(returnItemInputSchema).min(1, "Return request must contain at least one item"),
  notes: z.string().optional(),
});

export const inspectReturnItemSchema = z.object({
  returnItemId: z.string().uuid(),
  disposition: returnDispositionSchema,
  conditionNotes: z.string().optional(),
  refundAmount: z.number().nonnegative().default(0),
});

export const refundMethodSchema = z.enum([
  "CASH",
  "BANK_TRANSFER",
  "ORIGINAL_PAYMENT",
  "STORE_CREDIT",
]);

export const issueRefundSchema = z.object({
  returnId: z.string().uuid().optional(),
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  method: refundMethodSchema,
  transactionReference: z.string().optional(),
  notes: z.string().optional(),
});

export type ReturnStatus = z.infer<typeof returnStatusSchema>;
export type ReturnDisposition = z.infer<typeof returnDispositionSchema>;
export type ReturnItemInput = z.infer<typeof returnItemInputSchema>;
export type RequestReturnInput = z.infer<typeof requestReturnSchema>;
export type InspectReturnItemInput = z.infer<typeof inspectReturnItemSchema>;
export type RefundMethod = z.infer<typeof refundMethodSchema>;
export type IssueRefundInput = z.infer<typeof issueRefundSchema>;

// ==========================================
// 12. Audit Events
// ==========================================
export const auditEventSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  oldValues: z.record(z.any()).optional().nullable(),
  newValues: z.record(z.any()).optional().nullable(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
