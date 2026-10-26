# Version 1 — Relational Database Design & Architecture

## Overview
The Order & Inventory Management System uses **PostgreSQL 16** via **Drizzle ORM** (TypeScript) with Docker containerization on host port `5435`.

---

## Entity-Relationship Architecture

```mermaid
erDiagram
    USERS ||--o{ ORDERS : "creates"
    USERS ||--o{ PAYMENTS : "receives"
    USERS ||--o{ STOCK_RECEIPTS : "receives"
    USERS ||--o{ STOCK_MOVEMENTS : "performs"
    USERS ||--o{ RETURNS : "inspects"
    USERS ||--o{ REFUNDS : "processes"
    USERS ||--o{ AUDIT_EVENTS : "triggers"

    CATEGORIES ||--o{ CATEGORIES : "parent/child hierarchy"
    CATEGORIES ||--o{ PRODUCTS : "categorizes"

    SUPPLIERS ||--o{ STOCK_RECEIPTS : "supplies"

    PRODUCTS ||--|| INVENTORY_BALANCES : "has current balance"
    PRODUCTS ||--o{ STOCK_RECEIPT_ITEMS : "received item"
    PRODUCTS ||--o{ INVENTORY_RESERVATIONS : "reserved stock"
    PRODUCTS ||--o{ STOCK_MOVEMENTS : "physical changes"
    PRODUCTS ||--o{ ORDER_ITEMS : "sold line item"
    PRODUCTS ||--o{ RETURN_ITEMS : "returned line item"

    CUSTOMERS ||--o{ ORDERS : "places"

    ORDERS ||--|{ ORDER_ITEMS : "contains"
    ORDERS ||--o{ PAYMENTS : "paid via"
    ORDERS ||--o{ INVENTORY_RESERVATIONS : "commits"
    ORDERS ||--o{ RETURNS : "origin of"
    ORDERS ||--o{ REFUNDS : "refunded from"

    STOCK_RECEIPTS ||--|{ STOCK_RECEIPT_ITEMS : "itemized in"

    RETURNS ||--|{ RETURN_ITEMS : "itemized in"
    RETURNS ||--o{ REFUNDS : "triggers"

    ORDER_ITEMS ||--o{ RETURN_ITEMS : "returned against"
```

---

## Complete Table Specifications (17 Tables)

### 1. Product & Inventory Records
1. **`categories`**: Category hierarchy with self-referencing `parentId`.
2. **`products`**: Catalogue items (`sku`, `name`, `unitOfMeasure`, `retailPrice`, `defaultWholesalePrice`, `costPrice`, `minStockThreshold`, `status`, default return policy).
3. **`suppliers`**: Supplier details (`name`, `contactPerson`, `email`, `phone`, `address`, `notes`).
4. **`inventory_balances`**: Single stock location balances (`goodPhysicalQuantity`, `reservedQuantity`, `damagedQuantity`, `pendingInspectionQuantity`).
5. **`stock_receipts`**: Delivery headers (`receiptNumber`, `supplierId`, `receivedBy`, `receiptDate`, `totalCost`).
6. **`stock_receipt_items`**: Delivery line items (`receiptId`, `productId`, `quantityReceived`, `damagedQuantityReceived`, `unitCost`, `subtotalCost`).
7. **`inventory_reservations`**: Stock allocations for delivery orders (`orderId`, `productId`, `quantity`, `status`, `reservedAt`, `expiresAt`, `releasedAt`).
8. **`stock_movements`**: Immutable audit ledger (`productId`, `type`, `quantityDelta`, `physicalStockBefore`, `physicalStockAfter`, `referenceType`, `referenceId`, `performedBy`).

### 2. Customer, Order & Payment Records
9. **`customers`**: Retail and wholesale customer profiles (`type`, `creditLimit`, `creditTermsDays`, address).
10. **`orders`**: Order transactions (`orderNumber`, `customerId`, `orderType`, `status`, `paymentStatus`, `fulfilmentStatus`, totals, `returnToken`, `deliveryAddress`).
11. **`order_items`**: Agreed price and return policy snapshots (`orderId`, `productId`, `quantity`, `unitPrice`, `returnPolicyAllowedSnapshot`, `returnWindowDaysSnapshot`, `returnDeadline`).
12. **`payments`**: Individual incoming payments against orders (`orderId`, `amount`, `method`, `status`, `transactionReference`).

### 3. Returns & Refunds
13. **`returns`**: Return request headers (`returnNumber`, `orderId`, `status`, `requestedAt`, `inspectedAt`, `inspectedBy`).
14. **`return_items`**: Returned line items (`returnId`, `orderItemId`, `productId`, `quantity`, `disposition`, `refundAmount`, `reason`).
15. **`refunds`**: Explicit financial disbursements (`returnId`, `orderId`, `amount`, `method`, `status`, `processedBy`).

### 4. Access & Accountability
16. **`users`**: Staff accounts (`name`, `email`, `passwordHash`, `role`, `status`).
17. **`audit_events`**: Audit trail (`userId`, `action`, `entityType`, `entityId`, `oldValues`, `newValues`, `ipAddress`, `userAgent`).

---

## Live Connection Details
- **Container:** `order_inventory_mgmt_postgres`
- **Host Port:** `5435`
- **Database:** `order_inventory_management`
- **Connection URI:** `postgresql://postgres:postgres@localhost:5435/order_inventory_management`
