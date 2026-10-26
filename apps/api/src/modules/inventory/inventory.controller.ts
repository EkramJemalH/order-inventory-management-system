import { Elysia, t } from "elysia";
import {
  db,
  stockReceipts,
  stockReceiptItems,
  inventoryBalances,
  stockMovements,
  products,
  suppliers,
  eq,
  desc,
  sql,
} from "@repo/db";

export const inventoryController = new Elysia({ prefix: "/inventory" })
  // 1. Record Inbound Stock Receipt with Moving Weighted-Average Costing (WAC)
  .post(
    "/receipts",
    async ({ body, set }) => {
      try {
        const [existing] = await db
          .select({ id: stockReceipts.id })
          .from(stockReceipts)
          .where(eq(stockReceipts.receiptNumber, body.receiptNumber));

        if (existing) {
          set.status = 400;
          return { success: false, error: `Receipt number '${body.receiptNumber}' already exists.` };
        }

        const totalCost = body.items.reduce(
          (sum, item) => sum + item.quantityReceived * item.unitCost,
          0
        );

        const result = await db.transaction(async (tx) => {
          // 1. Create Receipt Header
          const [receipt] = await tx
            .insert(stockReceipts)
            .values({
              receiptNumber: body.receiptNumber,
              supplierId: body.supplierId,
              totalCost: totalCost.toFixed(2),
              notes: body.notes,
              receiptDate: body.receiptDate ? new Date(body.receiptDate) : new Date(),
            })
            .returning();

          const createdItems = [];

          // 2. Process each receipt line item & update WAC
          for (const item of body.items) {
            const damaged = item.damagedQuantityReceived || 0;
            const goodQty = item.quantityReceived - damaged;
            const subtotal = item.quantityReceived * item.unitCost;

            // Insert line item
            const [receiptItem] = await tx
              .insert(stockReceiptItems)
              .values({
                receiptId: receipt.id,
                productId: item.productId,
                quantityReceived: item.quantityReceived,
                damagedQuantityReceived: damaged,
                unitCost: item.unitCost.toFixed(2),
                subtotalCost: subtotal.toFixed(2),
              })
              .returning();

            createdItems.push(receiptItem);

            // Fetch current product & balance
            const [prod] = await tx
              .select({
                id: products.id,
                costPrice: products.costPrice,
              })
              .from(products)
              .where(eq(products.id, item.productId));

            if (!prod) {
              throw new Error(`Product ID ${item.productId} not found.`);
            }

            let [bal] = await tx
              .select()
              .from(inventoryBalances)
              .where(eq(inventoryBalances.productId, item.productId));

            if (!bal) {
              [bal] = await tx
                .insert(inventoryBalances)
                .values({
                  productId: item.productId,
                  goodPhysicalQuantity: 0,
                  reservedQuantity: 0,
                  damagedQuantity: 0,
                  pendingInspectionQuantity: 0,
                })
                .returning();
            }

            const currentGoodStock = bal.goodPhysicalQuantity;
            const currentCost = Number(prod.costPrice);

            // Calculate Moving Weighted-Average Cost:
            // ((currentGoodStock * currentCost) + (goodQty * unitCost)) / (currentGoodStock + goodQty)
            let newAvgCost = currentCost;
            const totalGoodStock = currentGoodStock + goodQty;

            if (totalGoodStock > 0 && goodQty > 0) {
              newAvgCost =
                (currentGoodStock * currentCost + goodQty * item.unitCost) / totalGoodStock;
            } else if (goodQty > 0 && currentGoodStock <= 0) {
              newAvgCost = item.unitCost;
            }

            // Update product weighted-average cost price
            await tx
              .update(products)
              .set({
                costPrice: newAvgCost.toFixed(2),
                updatedAt: new Date(),
              })
              .where(eq(products.id, item.productId));

            // Update inventory balances
            await tx
              .update(inventoryBalances)
              .set({
                goodPhysicalQuantity: currentGoodStock + goodQty,
                damagedQuantity: bal.damagedQuantity + damaged,
                updatedAt: new Date(),
              })
              .where(eq(inventoryBalances.productId, item.productId));

            // Record append-only stock movement for good stock
            if (goodQty > 0) {
              await tx.insert(stockMovements).values({
                productId: item.productId,
                type: "RECEIPT",
                quantityDelta: goodQty,
                physicalStockBefore: currentGoodStock,
                physicalStockAfter: currentGoodStock + goodQty,
                referenceType: "stock_receipt",
                referenceId: receipt.id,
                reason: `Received from supplier under receipt ${body.receiptNumber}`,
              });
            }

            // Record movement for damaged stock if any
            if (damaged > 0) {
              await tx.insert(stockMovements).values({
                productId: item.productId,
                type: "DAMAGE_FOUND",
                quantityDelta: damaged,
                physicalStockBefore: bal.damagedQuantity,
                physicalStockAfter: bal.damagedQuantity + damaged,
                referenceType: "stock_receipt",
                referenceId: receipt.id,
                reason: `Received damaged from supplier under receipt ${body.receiptNumber}`,
              });
            }
          }

          return { receipt, items: createdItems };
        });

        set.status = 201;
        return {
          success: true,
          data: result,
          message: "Stock receipt recorded and weighted-average costs updated successfully",
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to process stock receipt" };
      }
    },
    {
      body: t.Object({
        receiptNumber: t.String({ minLength: 2 }),
        supplierId: t.String({ format: "uuid" }),
        receiptDate: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            productId: t.String({ format: "uuid" }),
            quantityReceived: t.Number({ minimum: 1 }),
            damagedQuantityReceived: t.Optional(t.Number({ minimum: 0 })),
            unitCost: t.Number({ minimum: 0 }),
          }),
          { minItems: 1 }
        ),
      }),
      detail: {
        tags: ["Inventory"],
        summary: "Record supplier stock receipt with Moving Weighted-Average Costing",
      },
    }
  )

  // 2. List all Stock Receipts
  .get(
    "/receipts",
    async () => {
      const rows = await db
        .select({
          id: stockReceipts.id,
          receiptNumber: stockReceipts.receiptNumber,
          supplierId: stockReceipts.supplierId,
          supplierName: suppliers.name,
          totalCost: stockReceipts.totalCost,
          receiptDate: stockReceipts.receiptDate,
          notes: stockReceipts.notes,
          createdAt: stockReceipts.createdAt,
        })
        .from(stockReceipts)
        .leftJoin(suppliers, eq(stockReceipts.supplierId, suppliers.id))
        .orderBy(desc(stockReceipts.receiptDate));

      return { success: true, count: rows.length, data: rows };
    },
    {
      detail: {
        tags: ["Inventory"],
        summary: "List all stock receipts",
      },
    }
  )

  // 3. Get Stock Balances Summary (Available = Good - Reserved)
  .get(
    "/balances",
    async () => {
      const rows = await db
        .select({
          productId: products.id,
          sku: products.sku,
          name: products.name,
          costPrice: products.costPrice,
          minStockThreshold: products.minStockThreshold,
          goodPhysicalQuantity: sql<number>`COALESCE(${inventoryBalances.goodPhysicalQuantity}, 0)`,
          reservedQuantity: sql<number>`COALESCE(${inventoryBalances.reservedQuantity}, 0)`,
          damagedQuantity: sql<number>`COALESCE(${inventoryBalances.damagedQuantity}, 0)`,
          pendingInspectionQuantity: sql<number>`COALESCE(${inventoryBalances.pendingInspectionQuantity}, 0)`,
          availableQuantity: sql<number>`COALESCE(${inventoryBalances.goodPhysicalQuantity}, 0) - COALESCE(${inventoryBalances.reservedQuantity}, 0)`,
        })
        .from(products)
        .leftJoin(inventoryBalances, eq(products.id, inventoryBalances.productId))
        .orderBy(products.name);

      const data = rows.map((r) => {
        const available = Number(r.availableQuantity);
        const alertStatus =
          available <= 0
            ? "OUT_OF_STOCK"
            : available <= r.minStockThreshold
              ? "LOW_STOCK"
              : "IN_STOCK";

        return {
          ...r,
          goodPhysicalQuantity: Number(r.goodPhysicalQuantity),
          reservedQuantity: Number(r.reservedQuantity),
          damagedQuantity: Number(r.damagedQuantity),
          pendingInspectionQuantity: Number(r.pendingInspectionQuantity),
          availableQuantity: available,
          inventoryStatus: alertStatus,
        };
      });

      return { success: true, count: data.length, data };
    },
    {
      detail: {
        tags: ["Inventory"],
        summary: "List current inventory balances across all conditions",
      },
    }
  )

  // 4. View Stock Movement Audit Log
  .get(
    "/movements",
    async () => {
      const rows = await db
        .select({
          id: stockMovements.id,
          productId: stockMovements.productId,
          productSku: products.sku,
          productName: products.name,
          type: stockMovements.type,
          quantityDelta: stockMovements.quantityDelta,
          physicalStockBefore: stockMovements.physicalStockBefore,
          physicalStockAfter: stockMovements.physicalStockAfter,
          referenceType: stockMovements.referenceType,
          referenceId: stockMovements.referenceId,
          reason: stockMovements.reason,
          createdAt: stockMovements.createdAt,
        })
        .from(stockMovements)
        .leftJoin(products, eq(stockMovements.productId, products.id))
        .orderBy(desc(stockMovements.createdAt))
        .limit(100);

      return { success: true, count: rows.length, data: rows };
    },
    {
      detail: {
        tags: ["Inventory"],
        summary: "View append-only stock movement audit log",
      },
    }
  )

  // 5. Authorized Stock Adjustment
  .post(
    "/adjust",
    async ({ body, set }) => {
      try {
        const result = await db.transaction(async (tx) => {
          let [bal] = await tx
            .select()
            .from(inventoryBalances)
            .where(eq(inventoryBalances.productId, body.productId));

          if (!bal) {
            [bal] = await tx
              .insert(inventoryBalances)
              .values({
                productId: body.productId,
                goodPhysicalQuantity: 0,
                reservedQuantity: 0,
                damagedQuantity: 0,
                pendingInspectionQuantity: 0,
              })
              .returning();
          }

          const before = bal.goodPhysicalQuantity;
          const after = before + body.quantityDelta;

          if (after < 0) {
            throw new Error(`Adjustment would result in negative physical stock (${after}).`);
          }

          await tx
            .update(inventoryBalances)
            .set({
              goodPhysicalQuantity: after,
              updatedAt: new Date(),
            })
            .where(eq(inventoryBalances.productId, body.productId));

          const [movement] = await tx
            .insert(stockMovements)
            .values({
              productId: body.productId,
              type: body.quantityDelta >= 0 ? "ADJUSTMENT_ADD" : "ADJUSTMENT_SUB",
              quantityDelta: body.quantityDelta,
              physicalStockBefore: before,
              physicalStockAfter: after,
              referenceType: "manual_adjustment",
              reason: body.reason,
            })
            .returning();

          return { before, after, movement };
        });

        return {
          success: true,
          data: result,
          message: "Stock adjusted and audit movement recorded successfully",
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to adjust stock" };
      }
    },
    {
      body: t.Object({
        productId: t.String({ format: "uuid" }),
        quantityDelta: t.Number(),
        reason: t.String({ minLength: 3 }),
      }),
      detail: {
        tags: ["Inventory"],
        summary: "Perform authorized manual stock adjustment",
      },
    }
  );
