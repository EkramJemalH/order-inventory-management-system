import { Elysia, t } from "elysia";
import { db, suppliers, stockReceipts, eq, desc } from "@repo/db";

export const suppliersController = new Elysia({ prefix: "/suppliers" })
  .get(
    "/",
    async () => {
      const data = await db.select().from(suppliers).orderBy(desc(suppliers.createdAt));
      return { success: true, count: data.length, data };
    },
    {
      detail: {
        tags: ["Suppliers"],
        summary: "List all suppliers",
      },
    }
  )
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const [newSupplier] = await db
          .insert(suppliers)
          .values({
            name: body.name,
            contactPerson: body.contactPerson,
            email: body.email,
            phone: body.phone,
            address: body.address,
            notes: body.notes,
          })
          .returning();

        set.status = 201;
        return { success: true, data: newSupplier, message: "Supplier registered successfully" };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to register supplier" };
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 150 }),
        contactPerson: t.Optional(t.String()),
        email: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        address: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Suppliers"],
        summary: "Register a new supplier",
      },
    }
  )
  .get(
    "/:id",
    async ({ params: { id }, set }) => {
      const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
      if (!supplier) {
        set.status = 404;
        return { success: false, error: "Supplier not found" };
      }
      return { success: true, data: supplier };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Suppliers"],
        summary: "Get supplier details",
      },
    }
  )
  .get(
    "/:id/receipts",
    async ({ params: { id } }) => {
      const receipts = await db
        .select()
        .from(stockReceipts)
        .where(eq(stockReceipts.supplierId, id))
        .orderBy(desc(stockReceipts.receiptDate));

      return { success: true, count: receipts.length, data: receipts };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Suppliers"],
        summary: "Get stock receipt history for a supplier",
      },
    }
  );
