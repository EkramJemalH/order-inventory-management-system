import { Elysia, t } from "elysia";
import {
  db,
  returns,
  returnItems,
  refunds,
  orders,
  orderItems,
  inventoryBalances,
  stockMovements,
  products,
  eq,
  desc,
} from "@repo/db";

function generateReturnNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `RET-${dateStr}-${randomSuffix}`;
}

export const returnsController = new Elysia({ prefix: "/returns" })
  // 1. Submit Return Request
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const [order] = await db.select().from(orders).where(eq(orders.id, body.orderId));
        if (!order) {
          set.status = 404;
          return { success: false, error: "Order not found" };
        }

        const returnNumber = generateReturnNumber();

        const result = await db.transaction(async (tx) => {
          const [newReturn] = await tx
            .insert(returns)
            .values({
              returnNumber,
              orderId: body.orderId,
              status: "REQUESTED",
              notes: body.notes,
            })
            .returning();

          const createdItems = [];

          for (const item of body.items) {
            // Verify original order item
            const [orderItem] = await tx
              .select()
              .from(orderItems)
              .where(eq(orderItems.id, item.orderItemId));

            if (!orderItem) {
              throw new Error(`Order item ID ${item.orderItemId} not found.`);
            }

            if (item.quantity > orderItem.quantity) {
              throw new Error(
                `Returned quantity (${item.quantity}) exceeds purchased quantity (${orderItem.quantity}).`
              );
            }

            const [retItem] = await tx
              .insert(returnItems)
              .values({
                returnId: newReturn.id,
                orderItemId: item.orderItemId,
                productId: item.productId,
                quantity: item.quantity,
                disposition: "PENDING_INSPECTION",
                reason: item.reason,
              })
              .returning();

            createdItems.push(retItem);

            // Increment pending inspection quantity in inventory balances
            const [bal] = await tx
              .select()
              .from(inventoryBalances)
              .where(eq(inventoryBalances.productId, item.productId));

            if (bal) {
              await tx
                .update(inventoryBalances)
                .set({
                  pendingInspectionQuantity: bal.pendingInspectionQuantity + item.quantity,
                  updatedAt: new Date(),
                })
                .where(eq(inventoryBalances.productId, item.productId));
            }
          }

          return { returnRequest: newReturn, items: createdItems };
        });

        set.status = 201;
        return {
          success: true,
          data: result,
          message: "Return request submitted and marked pending inspection",
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to submit return request" };
      }
    },
    {
      body: t.Object({
        orderId: t.String({ format: "uuid" }),
        notes: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            orderItemId: t.String({ format: "uuid" }),
            productId: t.String({ format: "uuid" }),
            quantity: t.Number({ minimum: 1 }),
            reason: t.String({ minLength: 3 }),
          }),
          { minItems: 1 }
        ),
      }),
      detail: {
        tags: ["Returns"],
        summary: "Submit a customer return request",
      },
    }
  )

  // 2. List all Return Requests
  .get(
    "/",
    async () => {
      const rows = await db
        .select({
          id: returns.id,
          returnNumber: returns.returnNumber,
          orderId: returns.orderId,
          orderNumber: orders.orderNumber,
          status: returns.status,
          requestedAt: returns.requestedAt,
          inspectedAt: returns.inspectedAt,
          resolvedAt: returns.resolvedAt,
          notes: returns.notes,
        })
        .from(returns)
        .leftJoin(orders, eq(returns.orderId, orders.id))
        .orderBy(desc(returns.requestedAt));

      return { success: true, count: rows.length, data: rows };
    },
    {
      detail: {
        tags: ["Returns"],
        summary: "List all return requests",
      },
    }
  )

  // 3. Get single return request details
  .get(
    "/:id",
    async ({ params: { id }, set }) => {
      const [ret] = await db
        .select({
          id: returns.id,
          returnNumber: returns.returnNumber,
          orderId: returns.orderId,
          orderNumber: orders.orderNumber,
          status: returns.status,
          requestedAt: returns.requestedAt,
          inspectedAt: returns.inspectedAt,
          resolvedAt: returns.resolvedAt,
          notes: returns.notes,
        })
        .from(returns)
        .leftJoin(orders, eq(returns.orderId, orders.id))
        .where(eq(returns.id, id));

      if (!ret) {
        set.status = 404;
        return { success: false, error: "Return request not found" };
      }

      const items = await db
        .select({
          id: returnItems.id,
          orderItemId: returnItems.orderItemId,
          productId: returnItems.productId,
          productSku: products.sku,
          productName: products.name,
          quantity: returnItems.quantity,
          disposition: returnItems.disposition,
          refundAmount: returnItems.refundAmount,
          reason: returnItems.reason,
          conditionNotes: returnItems.conditionNotes,
        })
        .from(returnItems)
        .leftJoin(products, eq(returnItems.productId, products.id))
        .where(eq(returnItems.returnId, id));

      const refundRecords = await db.select().from(refunds).where(eq(refunds.returnId, id));

      return {
        success: true,
        data: {
          ...ret,
          items,
          refunds: refundRecords,
        },
      };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Returns"],
        summary: "Get return request details with line items and refunds",
      },
    }
  )

  // 4. Inspect Return Item (Restock or Damage classification)
  .post(
    "/:id/inspect",
    async ({ params: { id }, body, set }) => {
      try {
        const [ret] = await db.select().from(returns).where(eq(returns.id, id));
        if (!ret) {
          set.status = 404;
          return { success: false, error: "Return request not found" };
        }

        const [item] = await db
          .select()
          .from(returnItems)
          .where(eq(returnItems.id, body.returnItemId));

        if (!item || item.returnId !== id) {
          set.status = 404;
          return { success: false, error: "Return item not found in this request" };
        }

        const result = await db.transaction(async (tx) => {
          // 1. Update return item disposition
          const [updatedItem] = await tx
            .update(returnItems)
            .set({
              disposition: body.disposition,
              conditionNotes: body.conditionNotes,
              refundAmount: (body.refundAmount || 0).toFixed(2),
            })
            .where(eq(returnItems.id, body.returnItemId))
            .returning();

          // 2. Adjust inventory balances from pending inspection
          const [bal] = await tx
            .select()
            .from(inventoryBalances)
            .where(eq(inventoryBalances.productId, item.productId));

          if (bal) {
            const newPending = Math.max(0, bal.pendingInspectionQuantity - item.quantity);
            let newGood = bal.goodPhysicalQuantity;
            let newDamaged = bal.damagedQuantity;

            if (body.disposition === "RESTOCKED") {
              newGood += item.quantity;
              // Append stock movement for restock
              await tx.insert(stockMovements).values({
                productId: item.productId,
                type: "RETURN_RESTOCK",
                quantityDelta: item.quantity,
                physicalStockBefore: bal.goodPhysicalQuantity,
                physicalStockAfter: newGood,
                referenceType: "return",
                referenceId: id,
                reason: `Restocked from customer return ${ret.returnNumber}`,
              });
            } else if (body.disposition === "DAMAGED_WRITE_OFF") {
              newDamaged += item.quantity;
              await tx.insert(stockMovements).values({
                productId: item.productId,
                type: "RETURN_DAMAGED",
                quantityDelta: item.quantity,
                physicalStockBefore: bal.damagedQuantity,
                physicalStockAfter: newDamaged,
                referenceType: "return",
                referenceId: id,
                reason: `Customer return written off as damaged ${ret.returnNumber}`,
              });
            }

            await tx
              .update(inventoryBalances)
              .set({
                goodPhysicalQuantity: newGood,
                damagedQuantity: newDamaged,
                pendingInspectionQuantity: newPending,
                updatedAt: new Date(),
              })
              .where(eq(inventoryBalances.productId, item.productId));
          }

          // Mark return header as INSPECTED
          await tx
            .update(returns)
            .set({
              status: "INSPECTED",
              inspectedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(returns.id, id));

          return updatedItem;
        });

        return {
          success: true,
          data: result,
          message: `Return item inspected and marked ${body.disposition}`,
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to inspect return item" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        returnItemId: t.String({ format: "uuid" }),
        disposition: t.Union([
          t.Literal("RESTOCKED"),
          t.Literal("DAMAGED_WRITE_OFF"),
          t.Literal("RETURN_TO_SUPPLIER"),
          t.Literal("REJECTED"),
        ]),
        conditionNotes: t.Optional(t.String()),
        refundAmount: t.Optional(t.Number({ minimum: 0 })),
      }),
      detail: {
        tags: ["Returns"],
        summary: "Inspect returned item and classify for restock or damage write-off",
      },
    }
  )

  // 5. Issue Refund for an Inspected Return
  .post(
    "/:id/refund",
    async ({ params: { id }, body, set }) => {
      try {
        const [ret] = await db.select().from(returns).where(eq(returns.id, id));
        if (!ret) {
          set.status = 404;
          return { success: false, error: "Return request not found" };
        }

        const result = await db.transaction(async (tx) => {
          const [refund] = await tx
            .insert(refunds)
            .values({
              returnId: id,
              orderId: ret.orderId,
              amount: body.amount.toFixed(2),
              method: body.method,
              status: "COMPLETED",
              transactionReference: body.transactionReference,
              notes: body.notes,
            })
            .returning();

          await tx
            .update(returns)
            .set({
              status: "RESOLVED",
              resolvedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(returns.id, id));

          return refund;
        });

        set.status = 201;
        return { success: true, data: result, message: "Refund issued and return marked resolved" };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to issue refund" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        amount: t.Number({ minimum: 0.01 }),
        method: t.Union([
          t.Literal("CASH"),
          t.Literal("BANK_TRANSFER"),
          t.Literal("ORIGINAL_PAYMENT"),
          t.Literal("STORE_CREDIT"),
        ]),
        transactionReference: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Returns"],
        summary: "Issue refund for an inspected return request",
      },
    }
  );
