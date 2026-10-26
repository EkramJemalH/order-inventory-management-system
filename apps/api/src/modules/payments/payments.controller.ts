import { Elysia, t } from "elysia";
import { db, payments, orders, eq, desc } from "@repo/db";

export const paymentsController = new Elysia({ prefix: "/payments" })
  // 1. Record an installment or subsequent payment
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const [order] = await db
          .select()
          .from(orders)
          .where(eq(orders.id, body.orderId));

        if (!order) {
          set.status = 404;
          return { success: false, error: "Order not found" };
        }

        const currentOutstanding = Number(order.outstandingBalance);
        if (currentOutstanding <= 0) {
          set.status = 400;
          return { success: false, error: "This order is already fully paid." };
        }

        const result = await db.transaction(async (tx) => {
          // 1. Record payment
          const [newPayment] = await tx
            .insert(payments)
            .values({
              orderId: body.orderId,
              amount: body.amount.toFixed(2),
              method: body.method,
              status: "COMPLETED",
              transactionReference: body.transactionReference,
              notes: body.notes,
            })
            .returning();

          // 2. Calculate new total paid
          const allPayments = await tx
            .select()
            .from(payments)
            .where(eq(payments.orderId, body.orderId));

          const totalPaid = allPayments
            .filter((p) => p.status === "COMPLETED")
            .reduce((sum, p) => sum + Number(p.amount), 0);

          const totalOrder = Number(order.totalAmount);
          const newOutstanding = Math.max(0, totalOrder - totalPaid);

          let newPaymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID" = "PARTIALLY_PAID";
          if (newOutstanding <= 0) {
            newPaymentStatus = "PAID";
          } else if (totalPaid <= 0) {
            newPaymentStatus = "UNPAID";
          }

          // 3. Update order payment status and outstanding balance
          await tx
            .update(orders)
            .set({
              outstandingBalance: newOutstanding.toFixed(2),
              paymentStatus: newPaymentStatus,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, body.orderId));

          return { payment: newPayment, newOutstanding, newPaymentStatus };
        });

        set.status = 201;
        return {
          success: true,
          data: result,
          message: "Payment recorded and order balance updated successfully",
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to record payment" };
      }
    },
    {
      body: t.Object({
        orderId: t.String({ format: "uuid" }),
        amount: t.Number({ minimum: 0.01 }),
        method: t.Union([
          t.Literal("CASH"),
          t.Literal("CREDIT_CARD"),
          t.Literal("DEBIT_CARD"),
          t.Literal("BANK_TRANSFER"),
          t.Literal("MOBILE_MONEY"),
          t.Literal("OTHER"),
        ]),
        transactionReference: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Payments"],
        summary: "Record payment against an order",
      },
    }
  )

  // 2. List all Payments
  .get(
    "/",
    async () => {
      const rows = await db
        .select({
          id: payments.id,
          orderId: payments.orderId,
          orderNumber: orders.orderNumber,
          amount: payments.amount,
          method: payments.method,
          status: payments.status,
          transactionReference: payments.transactionReference,
          notes: payments.notes,
          paidAt: payments.paidAt,
        })
        .from(payments)
        .leftJoin(orders, eq(payments.orderId, orders.id))
        .orderBy(desc(payments.paidAt));

      return { success: true, count: rows.length, data: rows };
    },
    {
      detail: {
        tags: ["Payments"],
        summary: "List all payments",
      },
    }
  );
