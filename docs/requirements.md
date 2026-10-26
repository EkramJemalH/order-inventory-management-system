# Version 1 — Business Requirements Specification

## 1. System Scope & Boundaries
- **Single Shop / Single Warehouse**: Sells physical goods to retail (walk-in) and wholesale customers.
- **Supplier Receipts**: Receives stock from suppliers, recording actual unit costs and inspection condition.
- **Order Fulfilment**: In-store sales deduct stock immediately; delivery orders reserve stock on confirmation and deduct physical stock upon dispatch.
- **Payments & Credit**: Supports full, partial, multiple instalment, and credit sales linked to identifiable customers.
- **Returns & QR Workflow**: Product-specific return policies, secure customer request links/QR codes, inspection-based restock/write-off, and explicit refund records.

---

## 2. Independent Status Architecture

| Status Type | Allowed Values | Domain Ownership |
| :--- | :--- | :--- |
| **Product Status** | `ACTIVE`, `ARCHIVED` | Product catalogue offering status. Running out of stock does *not* archive a product. |
| **Order Status** | `DRAFT`, `CONFIRMED`, `CANCELLED`, `COMPLETED` | Lifecycle of the order transaction. |
| **Payment Status** | `UNPAID`, `PARTIALLY_PAID`, `PAID` | Financial status calculated from `totalAmount - netValidPayments`. |
| **Fulfilment Status** | `PREPARING`, `DISPATCHED`, `DELIVERED`, `HANDED_OVER`, `CANCELLED` | Physical state of goods. In-store sales are marked `HANDED_OVER` immediately. |
| **Reservation Status**| `ACTIVE`, `FULFILLED`, `RELEASED`, `EXPIRED` | Stock allocated to open delivery orders. |
| **Return Status** | `REQUESTED`, `APPROVED`, `REJECTED`, `INSPECTED`, `RESOLVED` | Lifecycle of a customer return request. |
| **Return Disposition**| `PENDING_INSPECTION`, `RESTOCKED`, `DAMAGED_WRITE_OFF`, `RETURN_TO_SUPPLIER`, `REJECTED` | Physical destination of the returned unit after inspection. |

---

## 3. Inventory Quantity Formula

```text
Available Quantity = Good Physical Stock - Reserved Quantity
```
- **Good Physical Stock:** Sellable units physically inside the shop (includes units committed to open delivery orders).
- **Reserved Quantity:** Subset of physical stock promised to confirmed delivery orders awaiting dispatch.
- **Damaged Quantity:** Units physically present but unsellable.
- **Pending Inspection Quantity:** Returned units awaiting manager/staff inspection.
