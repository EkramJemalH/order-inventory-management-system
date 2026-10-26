import { Elysia, t } from "elysia";
import {
  db,
  orders,
  orderItems,
  inventoryBalances,
  inventoryReservations,
  stockMovements,
  products,
  customers,
  payments,
  eq,
  desc,
  and,
  sql,
} from "@repo/db";

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${dateStr}-${randomSuffix}`;
}

export const ordersController = new Elysia({ prefix: "/orders" })
  // 1. Create Order / POS Checkout
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const orderNumber = generateOrderNumber();
        const orderType = body.orderType || "IN_STORE";

        const result = await db.transaction(async (tx) => {
          let calculatedSubtotal = 0;
          let calculatedTax = 0;
          const validatedItems = [];

          // Validate each product, prices, tax, and stock availability
          for (const item of body.items) {
            const [prod] = await tx
              .select()
              .from(products)
              .where(eq(products.id, item.productId));

            if (!prod) {
              throw new Error(`Product ID ${item.productId} does not exist.`);
            }

            if (prod.status === "ARCHIVED") {
              throw new Error(`Product '${prod.name}' is archived and cannot be sold.`);
            }

            // Check stock availability
            const [bal] = await tx
              .select()
              .from(inventoryBalances)
              .where(eq(inventoryBalances.productId, item.productId));

            const goodStock = bal ? bal.goodPhysicalQuantity : 0;
            const reservedStock = bal ? bal.reservedQuantity : 0;
            const availableStock = goodStock - reservedStock;

            if (availableStock < item.quantity) {
              throw new Error(
                `Insufficient stock for '${prod.name}'. Requested: ${item.quantity}, Available: ${availableStock}.`
              );
            }

            // Use provided unit price (or fallback to retail/wholesale)
            const unitPrice =
              item.unitPrice !== undefined ? item.unitPrice : Number(prod.retailPrice);
            const lineSubtotal = unitPrice * item.quantity;
            calculatedSubtotal += lineSubtotal;

            // Calculate line tax (if taxable)
            let lineTax = 0;
            const taxRate = prod.isTaxable ? Number(prod.taxRate) : 0;
            if (prod.isTaxable && taxRate > 0) {
              lineTax = lineSubtotal * taxRate;
              calculatedTax += lineTax;
            }

            // Calculate return deadline
            const returnDays = prod.defaultReturnWindowDays || 7;
            const deadline = new Date();
            deadline.setDate(deadline.getDate() + returnDays);

            validatedItems.push({
              productId: prod.id,
              productName: prod.name,
              quantity: item.quantity,
              unitPrice,
              lineSubtotal,
              costPriceSnapshot: Number(prod.costPrice),
              taxRateSnapshot: taxRate,
              taxAmount: lineTax,
              returnPolicyAllowed: prod.defaultReturnPolicyAllowed,
              returnWindowDays: returnDays,
              returnDeadline: deadline,
              currentGoodStock: goodStock,
              currentReservedStock: reservedStock,
            });
          }

          const discount = body.discountAmount || 0;
          const totalAmount = Math.max(0, calculatedSubtotal + calculatedTax - discount);
          const initialPayment = body.initialPaymentAmount || 0;
          const remainingBalance = Math.max(0, totalAmount - initialPayment);

          let paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID" = "UNPAID";
          if (initialPayment >= totalAmount && totalAmount > 0) {
            paymentStatus = "PAID";
          } else if (initialPayment > 0) {
            paymentStatus = "PARTIALLY_PAID";
          }

          const fulfilmentStatus = orderType === "IN_STORE" ? "HANDED_OVER" : "PREPARING";

          // Insert order header
          const [newOrder] = await tx
            .insert(orders)
            .values({
              orderNumber,
              customerId: body.customerId,
              orderType,
              status: "CONFIRMED",
              paymentStatus,
              fulfilmentStatus,
              subtotalAmount: calculatedSubtotal.toFixed(2),
              taxAmount: calculatedTax.toFixed(2),
              discountAmount: discount.toFixed(2),
              totalAmount: totalAmount.toFixed(2),
              outstandingBalance: remainingBalance.toFixed(2),
              deliveryAddress: body.deliveryAddress,
              deliveryRecipientName: body.deliveryRecipientName,
              deliveryRecipientPhone: body.deliveryRecipientPhone,
              notes: body.notes,
            })
            .returning();

          // Insert order items & handle inventory movements
          for (const item of validatedItems) {
            await tx.insert(orderItems).values({
              orderId: newOrder.id,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice.toFixed(2),
              subtotal: item.lineSubtotal.toFixed(2),
              costPriceSnapshot: item.costPriceSnapshot.toFixed(2),
              taxRateSnapshot: item.taxRateSnapshot.toFixed(2),
              taxAmount: item.taxAmount.toFixed(2),
              returnPolicyAllowedSnapshot: item.returnPolicyAllowed,
              returnWindowDaysSnapshot: item.returnWindowDays,
              returnDeadline: item.returnDeadline,
            });

            if (orderType === "IN_STORE") {
              // Deduct physical stock immediately for in-store purchases
              const newGoodStock = item.currentGoodStock - item.quantity;
              await tx
                .update(inventoryBalances)
                .set({
                  goodPhysicalQuantity: newGoodStock,
                  updatedAt: new Date(),
                })
                .where(eq(inventoryBalances.productId, item.productId));

              // Record append-only stock movement
              await tx.insert(stockMovements).values({
                productId: item.productId,
                type: "SALE_IN_STORE",
                quantityDelta: -item.quantity,
                physicalStockBefore: item.currentGoodStock,
                physicalStockAfter: newGoodStock,
                referenceType: "order",
                referenceId: newOrder.id,
                reason: `In-store checkout order ${orderNumber}`,
              });
            } else {
              // Delivery order: Reserve stock until dispatch
              const newReservedStock = item.currentReservedStock + item.quantity;
              await tx
                .update(inventoryBalances)
                .set({
                  reservedQuantity: newReservedStock,
                  updatedAt: new Date(),
                })
                .where(eq(inventoryBalances.productId, item.productId));

              // Create reservation entry
              await tx.insert(inventoryReservations).values({
                orderId: newOrder.id,
                productId: item.productId,
                quantity: item.quantity,
                status: "ACTIVE",
              });
            }
          }

          // If payment was provided at checkout, record payment record
          if (initialPayment > 0) {
            await tx.insert(payments).values({
              orderId: newOrder.id,
              amount: initialPayment.toFixed(2),
              method: body.paymentMethod || "CASH",
              status: "COMPLETED",
              transactionReference: body.paymentReference,
              notes: "Initial payment recorded at order checkout",
            });
          }

          return newOrder;
        });

        set.status = 201;
        return {
          success: true,
          data: result,
          message: "Order confirmed and processed successfully",
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to create order" };
      }
    },
    {
      body: t.Object({
        customerId: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
        orderType: t.Optional(t.Union([t.Literal("IN_STORE"), t.Literal("DELIVERY")])),
        discountAmount: t.Optional(t.Number({ minimum: 0 })),
        initialPaymentAmount: t.Optional(t.Number({ minimum: 0 })),
        paymentMethod: t.Optional(
          t.Union([
            t.Literal("CASH"),
            t.Literal("CREDIT_CARD"),
            t.Literal("DEBIT_CARD"),
            t.Literal("BANK_TRANSFER"),
            t.Literal("MOBILE_MONEY"),
            t.Literal("OTHER"),
          ])
        ),
        paymentReference: t.Optional(t.String()),
        deliveryAddress: t.Optional(t.String()),
        deliveryRecipientName: t.Optional(t.String()),
        deliveryRecipientPhone: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            productId: t.String({ format: "uuid" }),
            quantity: t.Number({ minimum: 1 }),
            unitPrice: t.Optional(t.Number({ minimum: 0 })),
          }),
          { minItems: 1 }
        ),
      }),
      detail: {
        tags: ["Orders"],
        summary: "Process in-store checkout or delivery order",
      },
    }
  )

  // 2. List all Orders
  .get(
    "/",
    async ({ query }) => {
      const status = query.status as any;
      const paymentStatus = query.paymentStatus as any;
      const orderType = query.orderType as any;

      const conditions = [];
      if (status) conditions.push(eq(orders.status, status));
      if (paymentStatus) conditions.push(eq(orders.paymentStatus, paymentStatus));
      if (orderType) conditions.push(eq(orders.orderType, orderType));

      const rows = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          customerId: orders.customerId,
          customerName: customers.name,
          orderType: orders.orderType,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          fulfilmentStatus: orders.fulfilmentStatus,
          subtotalAmount: orders.subtotalAmount,
          taxAmount: orders.taxAmount,
          discountAmount: orders.discountAmount,
          totalAmount: orders.totalAmount,
          outstandingBalance: orders.outstandingBalance,
          orderDate: orders.orderDate,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(orders.orderDate));

      return { success: true, count: rows.length, data: rows };
    },
    {
      query: t.Object({
        status: t.Optional(
          t.Union([
            t.Literal("DRAFT"),
            t.Literal("CONFIRMED"),
            t.Literal("CANCELLED"),
            t.Literal("COMPLETED"),
          ])
        ),
        paymentStatus: t.Optional(
          t.Union([t.Literal("UNPAID"), t.Literal("PARTIALLY_PAID"), t.Literal("PAID")])
        ),
        orderType: t.Optional(t.Union([t.Literal("IN_STORE"), t.Literal("DELIVERY")])),
      }),
      detail: {
        tags: ["Orders"],
        summary: "List orders with filters",
      },
    }
  )

  // 3. Get single order details with items and payments
  .get(
    "/:id",
    async ({ params: { id }, set }) => {
      const [order] = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          customerId: orders.customerId,
          customerName: customers.name,
          customerPhone: customers.phone,
          customerEmail: customers.email,
          orderType: orders.orderType,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          fulfilmentStatus: orders.fulfilmentStatus,
          subtotalAmount: orders.subtotalAmount,
          taxAmount: orders.taxAmount,
          discountAmount: orders.discountAmount,
          totalAmount: orders.totalAmount,
          outstandingBalance: orders.outstandingBalance,
          deliveryAddress: orders.deliveryAddress,
          deliveryRecipientName: orders.deliveryRecipientName,
          deliveryRecipientPhone: orders.deliveryRecipientPhone,
          notes: orders.notes,
          orderDate: orders.orderDate,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(eq(orders.id, id));

      if (!order) {
        set.status = 404;
        return { success: false, error: "Order not found" };
      }

      // Fetch items with product details
      const items = await db
        .select({
          id: orderItems.id,
          productId: orderItems.productId,
          productSku: products.sku,
          productName: products.name,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          subtotal: orderItems.subtotal,
          costPriceSnapshot: orderItems.costPriceSnapshot,
          taxRateSnapshot: orderItems.taxRateSnapshot,
          taxAmount: orderItems.taxAmount,
          returnDeadline: orderItems.returnDeadline,
        })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, id));

      // Fetch payments recorded against this order
      const orderPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.orderId, id))
        .orderBy(desc(payments.paidAt));

      return {
        success: true,
        data: {
          ...order,
          items,
          payments: orderPayments,
        },
      };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Orders"],
        summary: "Get order details, items, and payment history",
      },
    }
  )

  // 4. Update Delivery Fulfilment Status (Release stock on dispatch)
  .patch(
    "/:id/fulfilment",
    async ({ params: { id }, body, set }) => {
      try {
        const [order] = await db.select().from(orders).where(eq(orders.id, id));
        if (!order) {
          set.status = 404;
          return { success: false, error: "Order not found" };
        }

        if (order.status === "CANCELLED") {
          set.status = 400;
          return { success: false, error: "Cannot update fulfilment on a cancelled order" };
        }

        const currentStatus = order.fulfilmentStatus;
        const targetStatus = body.status;

        const result = await db.transaction(async (tx) => {
          // When dispatching: Physically goods leave the shop!
          // Decrement goodPhysicalQuantity, decrement reservedQuantity, release reservation, record movement.
          if (currentStatus === "PREPARING" && targetStatus === "DISPATCHED") {
            const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));

            for (const item of items) {
              const [bal] = await tx
                .select()
                .from(inventoryBalances)
                .where(eq(inventoryBalances.productId, item.productId));

              if (bal) {
                const newGoodStock = bal.goodPhysicalQuantity - item.quantity;
                const newReserved = Math.max(0, bal.reservedQuantity - item.quantity);

                await tx
                  .update(inventoryBalances)
                  .set({
                    goodPhysicalQuantity: newGoodStock,
                    reservedQuantity: newReserved,
                    updatedAt: new Date(),
                  })
                  .where(eq(inventoryBalances.productId, item.productId));

                // Append stock movement for dispatch
                await tx.insert(stockMovements).values({
                  productId: item.productId,
                  type: "DISPATCH_DELIVERY",
                  quantityDelta: -item.quantity,
                  physicalStockBefore: bal.goodPhysicalQuantity,
                  physicalStockAfter: newGoodStock,
                  referenceType: "order",
                  referenceId: id,
                  reason: `Dispatched for delivery under order ${order.orderNumber}`,
                });
              }

              // Update reservation to FULFILLED
              await tx
                .update(inventoryReservations)
                .set({ status: "FULFILLED", releasedAt: new Date() })
                .where(
                  and(
                    eq(inventoryReservations.orderId, id),
                    eq(inventoryReservations.productId, item.productId)
                  )
                );
            }

            const [updated] = await tx
              .update(orders)
              .set({
                fulfilmentStatus: "DISPATCHED",
                dispatchedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(orders.id, id))
              .returning();

            return updated;
          }

          // When delivered: Goods handed to customer
          if (targetStatus === "DELIVERED") {
            const [updated] = await tx
              .update(orders)
              .set({
                fulfilmentStatus: "DELIVERED",
                deliveredAt: new Date(),
                status: "COMPLETED",
                updatedAt: new Date(),
              })
              .where(eq(orders.id, id))
              .returning();

            return updated;
          }

          // Fallback simple status update
          const [updated] = await tx
            .update(orders)
            .set({
              fulfilmentStatus: targetStatus,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, id))
            .returning();

          return updated;
        });

        return {
          success: true,
          data: result,
          message: `Order fulfilment status transitioned to ${targetStatus}`,
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to update fulfilment status" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        status: t.Union([
          t.Literal("PREPARING"),
          t.Literal("DISPATCHED"),
          t.Literal("DELIVERED"),
          t.Literal("CANCELLED"),
        ]),
      }),
      detail: {
        tags: ["Orders"],
        summary: "Update delivery fulfilment status (dispatches stock, marks delivered)",
      },
    }
  )

  // 5. Cancel Order (safely handles stock and reservations)
  .post(
    "/:id/cancel",
    async ({ params: { id }, body, set }) => {
      try {
        const [order] = await db.select().from(orders).where(eq(orders.id, id));
        if (!order) {
          set.status = 404;
          return { success: false, error: "Order not found" };
        }

        if (order.status === "CANCELLED") {
          set.status = 400;
          return { success: false, error: "Order is already cancelled." };
        }

        if (order.fulfilmentStatus === "DISPATCHED" || order.fulfilmentStatus === "DELIVERED") {
          set.status = 400;
          return {
            success: false,
            error:
              "Cannot cancel an order that has already been dispatched or delivered. Use the Return workflow.",
          };
        }

        const result = await db.transaction(async (tx) => {
          // If delivery order with active reservations, release the reservations
          if (order.orderType === "DELIVERY") {
            const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));

            for (const item of items) {
              const [bal] = await tx
                .select()
                .from(inventoryBalances)
                .where(eq(inventoryBalances.productId, item.productId));

              if (bal) {
                const newReserved = Math.max(0, bal.reservedQuantity - item.quantity);
                await tx
                  .update(inventoryBalances)
                  .set({
                    reservedQuantity: newReserved,
                    updatedAt: new Date(),
                  })
                  .where(eq(inventoryBalances.productId, item.productId));
              }

              await tx
                .update(inventoryReservations)
                .set({ status: "RELEASED", releasedAt: new Date() })
                .where(
                  and(
                    eq(inventoryReservations.orderId, id),
                    eq(inventoryReservations.productId, item.productId)
                  )
                );
            }
          }

          const [cancelled] = await tx
            .update(orders)
            .set({
              status: "CANCELLED",
              fulfilmentStatus: "CANCELLED",
              notes: body.reason ? `${order.notes || ""} [Cancelled: ${body.reason}]` : order.notes,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, id))
            .returning();

          return cancelled;
        });

        return {
          success: true,
          data: result,
          message: "Order cancelled and any active reservations released successfully",
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to cancel order" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        reason: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Orders"],
        summary: "Cancel order and release reserved stock",
      },
    }
  );

