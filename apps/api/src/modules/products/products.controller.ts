import { Elysia, t } from "elysia";
import {
  db,
  products,
  inventoryBalances,
  categories,
  eq,
  desc,
  and,
  ilike,
  or,
  sql,
} from "@repo/db";

export const productsController = new Elysia({ prefix: "/products" })
  .get(
    "/",
    async ({ query }) => {
      const search = query.search?.trim();
      const categoryId = query.categoryId;
      const status = query.status as "ACTIVE" | "ARCHIVED" | undefined;

      const conditions = [];

      if (status) {
        conditions.push(eq(products.status, status));
      }

      if (categoryId) {
        conditions.push(eq(products.categoryId, categoryId));
      }

      if (search) {
        conditions.push(
          or(
            ilike(products.name, `%${search}%`),
            ilike(products.sku, `%${search}%`),
            ilike(products.barcode, `%${search}%`)
          )
        );
      }

      const rows = await db
        .select({
          id: products.id,
          sku: products.sku,
          barcode: products.barcode,
          name: products.name,
          description: products.description,
          categoryId: products.categoryId,
          categoryName: categories.name,
          unitOfMeasure: products.unitOfMeasure,
          retailPrice: products.retailPrice,
          defaultWholesalePrice: products.defaultWholesalePrice,
          costPrice: products.costPrice,
          minStockThreshold: products.minStockThreshold,
          status: products.status,
          isTaxable: products.isTaxable,
          taxRate: products.taxRate,
          defaultReturnPolicyAllowed: products.defaultReturnPolicyAllowed,
          defaultReturnWindowDays: products.defaultReturnWindowDays,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
          goodPhysicalStock: sql<number>`COALESCE(${inventoryBalances.goodPhysicalQuantity}, 0)`,
          reservedStock: sql<number>`COALESCE(${inventoryBalances.reservedQuantity}, 0)`,
          damagedStock: sql<number>`COALESCE(${inventoryBalances.damagedQuantity}, 0)`,
          pendingInspectionStock: sql<number>`COALESCE(${inventoryBalances.pendingInspectionQuantity}, 0)`,
          availableStock: sql<number>`COALESCE(${inventoryBalances.goodPhysicalQuantity}, 0) - COALESCE(${inventoryBalances.reservedQuantity}, 0)`,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .leftJoin(inventoryBalances, eq(products.id, inventoryBalances.productId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(products.createdAt));

      const data = rows.map((p) => {
        const available = Number(p.availableStock);
        let inventoryAlert: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" = "IN_STOCK";
        if (available <= 0) {
          inventoryAlert = "OUT_OF_STOCK";
        } else if (available <= p.minStockThreshold) {
          inventoryAlert = "LOW_STOCK";
        }

        return {
          ...p,
          goodPhysicalStock: Number(p.goodPhysicalStock),
          reservedStock: Number(p.reservedStock),
          damagedStock: Number(p.damagedStock),
          pendingInspectionStock: Number(p.pendingInspectionStock),
          availableStock: available,
          inventoryAlert,
        };
      });

      return { success: true, count: data.length, data };
    },
    {
      query: t.Object({
        search: t.Optional(t.String()),
        categoryId: t.Optional(t.String()),
        status: t.Optional(t.Union([t.Literal("ACTIVE"), t.Literal("ARCHIVED")])),
      }),
      detail: {
        tags: ["Products"],
        summary: "List all products with real-time inventory balances",
      },
    }
  )
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const [existingSku] = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.sku, body.sku));

        if (existingSku) {
          set.status = 400;
          return { success: false, error: `SKU '${body.sku}' already exists.` };
        }

        const result = await db.transaction(async (tx) => {
          const [newProduct] = await tx
            .insert(products)
            .values({
              sku: body.sku,
              barcode: body.barcode,
              name: body.name,
              description: body.description,
              categoryId: body.categoryId,
              unitOfMeasure: body.unitOfMeasure || "pcs",
              retailPrice: body.retailPrice.toFixed(2),
              defaultWholesalePrice: body.defaultWholesalePrice.toFixed(2),
              costPrice: (body.costPrice || 0).toFixed(2),
              minStockThreshold: body.minStockThreshold ?? 10,
              isTaxable: body.isTaxable ?? true,
              taxRate: (body.taxRate ?? 0.15).toFixed(2),
              defaultReturnPolicyAllowed: body.defaultReturnPolicyAllowed ?? true,
              defaultReturnWindowDays: body.defaultReturnWindowDays ?? 7,
              defaultReturnCondition: body.defaultReturnCondition || "Original packaging, unworn, tags attached",
            })
            .returning();

          // Initialize inventory balance record for the new product
          await tx.insert(inventoryBalances).values({
            productId: newProduct.id,
            goodPhysicalQuantity: 0,
            reservedQuantity: 0,
            damagedQuantity: 0,
            pendingInspectionQuantity: 0,
          });

          return newProduct;
        });

        set.status = 201;
        return {
          success: true,
          data: result,
          message: "Product registered and inventory balance initialized successfully",
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to create product" };
      }
    },
    {
      body: t.Object({
        sku: t.String({ minLength: 2, maxLength: 50 }),
        barcode: t.Optional(t.String()),
        name: t.String({ minLength: 2, maxLength: 200 }),
        description: t.Optional(t.String()),
        categoryId: t.Optional(t.Nullable(t.String())),
        unitOfMeasure: t.Optional(t.String()),
        retailPrice: t.Number({ minimum: 0 }),
        defaultWholesalePrice: t.Number({ minimum: 0 }),
        costPrice: t.Optional(t.Number({ minimum: 0 })),
        minStockThreshold: t.Optional(t.Number({ minimum: 0 })),
        isTaxable: t.Optional(t.Boolean()),
        taxRate: t.Optional(t.Number({ minimum: 0, maximum: 1 })),
        defaultReturnPolicyAllowed: t.Optional(t.Boolean()),
        defaultReturnWindowDays: t.Optional(t.Number({ minimum: 0 })),
        defaultReturnCondition: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Products"],
        summary: "Register a new product in catalogue",
      },
    }
  )
  .get(
    "/:id",
    async ({ params: { id }, set }) => {
      const [product] = await db
        .select({
          id: products.id,
          sku: products.sku,
          barcode: products.barcode,
          name: products.name,
          description: products.description,
          categoryId: products.categoryId,
          categoryName: categories.name,
          unitOfMeasure: products.unitOfMeasure,
          retailPrice: products.retailPrice,
          defaultWholesalePrice: products.defaultWholesalePrice,
          costPrice: products.costPrice,
          minStockThreshold: products.minStockThreshold,
          status: products.status,
          isTaxable: products.isTaxable,
          taxRate: products.taxRate,
          defaultReturnPolicyAllowed: products.defaultReturnPolicyAllowed,
          defaultReturnWindowDays: products.defaultReturnWindowDays,
          defaultReturnCondition: products.defaultReturnCondition,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
          goodPhysicalStock: sql<number>`COALESCE(${inventoryBalances.goodPhysicalQuantity}, 0)`,
          reservedStock: sql<number>`COALESCE(${inventoryBalances.reservedQuantity}, 0)`,
          damagedStock: sql<number>`COALESCE(${inventoryBalances.damagedQuantity}, 0)`,
          pendingInspectionStock: sql<number>`COALESCE(${inventoryBalances.pendingInspectionQuantity}, 0)`,
          availableStock: sql<number>`COALESCE(${inventoryBalances.goodPhysicalQuantity}, 0) - COALESCE(${inventoryBalances.reservedQuantity}, 0)`,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .leftJoin(inventoryBalances, eq(products.id, inventoryBalances.productId))
        .where(eq(products.id, id));

      if (!product) {
        set.status = 404;
        return { success: false, error: "Product not found" };
      }

      const available = Number(product.availableStock);
      const inventoryAlert =
        available <= 0
          ? "OUT_OF_STOCK"
          : available <= product.minStockThreshold
            ? "LOW_STOCK"
            : "IN_STOCK";

      return {
        success: true,
        data: {
          ...product,
          goodPhysicalStock: Number(product.goodPhysicalStock),
          reservedStock: Number(product.reservedStock),
          damagedStock: Number(product.damagedStock),
          pendingInspectionStock: Number(product.pendingInspectionStock),
          availableStock: available,
          inventoryAlert,
        },
      };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Products"],
        summary: "Get single product with inventory balances",
      },
    }
  )
  .patch(
    "/:id",
    async ({ params: { id }, body, set }) => {
      try {
        const updateValues: Record<string, any> = {
          updatedAt: new Date(),
        };

        if (body.name !== undefined) updateValues.name = body.name;
        if (body.description !== undefined) updateValues.description = body.description;
        if (body.categoryId !== undefined) updateValues.categoryId = body.categoryId;
        if (body.unitOfMeasure !== undefined) updateValues.unitOfMeasure = body.unitOfMeasure;
        if (body.retailPrice !== undefined) updateValues.retailPrice = body.retailPrice.toFixed(2);
        if (body.defaultWholesalePrice !== undefined)
          updateValues.defaultWholesalePrice = body.defaultWholesalePrice.toFixed(2);
        if (body.minStockThreshold !== undefined)
          updateValues.minStockThreshold = body.minStockThreshold;
        if (body.status !== undefined) updateValues.status = body.status;
        if (body.isTaxable !== undefined) updateValues.isTaxable = body.isTaxable;
        if (body.taxRate !== undefined) updateValues.taxRate = body.taxRate.toFixed(2);
        if (body.barcode !== undefined) updateValues.barcode = body.barcode;

        const [updated] = await db
          .update(products)
          .set(updateValues)
          .where(eq(products.id, id))
          .returning();

        if (!updated) {
          set.status = 404;
          return { success: false, error: "Product not found" };
        }

        return { success: true, data: updated, message: "Product updated successfully" };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to update product" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          name: t.String(),
          description: t.String(),
          categoryId: t.Nullable(t.String()),
          barcode: t.String(),
          unitOfMeasure: t.String(),
          retailPrice: t.Number({ minimum: 0 }),
          defaultWholesalePrice: t.Number({ minimum: 0 }),
          minStockThreshold: t.Number({ minimum: 0 }),
          status: t.Union([t.Literal("ACTIVE"), t.Literal("ARCHIVED")]),
          isTaxable: t.Boolean(),
          taxRate: t.Number({ minimum: 0, maximum: 1 }),
        })
      ),
      detail: {
        tags: ["Products"],
        summary: "Update product details, prices, or archive status",
      },
    }
  );
