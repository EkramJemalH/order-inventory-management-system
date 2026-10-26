import { Elysia, t } from "elysia";
import { db, customers, orders, eq, desc, and, ne } from "@repo/db";

export const customersController = new Elysia({ prefix: "/customers" })
  .get(
    "/",
    async () => {
      const data = await db.select().from(customers).orderBy(desc(customers.createdAt));
      return { success: true, count: data.length, data };
    },
    {
      detail: {
        tags: ["Customers"],
        summary: "List all customers",
      },
    }
  )
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const [newCustomer] = await db
          .insert(customers)
          .values({
            name: body.name,
            email: body.email,
            phone: body.phone,
            companyName: body.companyName,
            taxNumber: body.taxNumber,
            type: body.type || "RETAIL",
            creditLimit: (body.creditLimit || 0).toFixed(2),
            creditTermsDays: body.creditTermsDays,
            address: body.address,
            city: body.city,
            notes: body.notes,
          })
          .returning();

        set.status = 201;
        return { success: true, data: newCustomer, message: "Customer created successfully" };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to create customer" };
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 150 }),
        email: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        companyName: t.Optional(t.String()),
        taxNumber: t.Optional(t.String()),
        type: t.Optional(t.Union([t.Literal("RETAIL"), t.Literal("WHOLESALE")])),
        creditLimit: t.Optional(t.Number({ minimum: 0 })),
        creditTermsDays: t.Optional(t.String()),
        address: t.Optional(t.String()),
        city: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Customers"],
        summary: "Register a customer profile",
      },
    }
  )
  .get(
    "/:id",
    async ({ params: { id }, set }) => {
      const [customer] = await db.select().from(customers).where(eq(customers.id, id));
      if (!customer) {
        set.status = 404;
        return { success: false, error: "Customer not found" };
      }
      return { success: true, data: customer };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Customers"],
        summary: "Get customer by ID",
      },
    }
  )
  .get(
    "/:id/credit",
    async ({ params: { id }, set }) => {
      const [customer] = await db.select().from(customers).where(eq(customers.id, id));
      if (!customer) {
        set.status = 404;
        return { success: false, error: "Customer not found" };
      }

      // Fetch all customer orders with outstanding balances
      const unpaidOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.customerId, id),
            ne(orders.paymentStatus, "PAID"),
            ne(orders.status, "CANCELLED")
          )
        )
        .orderBy(desc(orders.orderDate));

      const totalOutstanding = unpaidOrders.reduce(
        (sum, o) => sum + Number(o.outstandingBalance),
        0
      );

      const totalPurchases = await db
        .select()
        .from(orders)
        .where(and(eq(orders.customerId, id), ne(orders.status, "CANCELLED")));

      const lifetimeSpent = totalPurchases.reduce((sum, o) => sum + Number(o.totalAmount), 0);

      return {
        success: true,
        data: {
          customer,
          lifetimeSpent: lifetimeSpent.toFixed(2),
          totalOutstanding: totalOutstanding.toFixed(2),
          creditLimit: customer.creditLimit,
          unpaidOrdersCount: unpaidOrders.length,
          unpaidOrders,
        },
      };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Customers"],
        summary: "Get customer credit and outstanding balance summary",
      },
    }
  );
