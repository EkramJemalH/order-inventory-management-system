import { Elysia } from "elysia";
import {
  db,
  orders,
  orderItems,
  payments,
  products,
  inventoryBalances,
  customers,
  eq,
  ne,
  sql,
  desc,
} from "@repo/db";

export const reportsController = new Elysia({ prefix: "/reports" })
  // 1. Executive Dashboard KPI Metrics
  .get(
    "/dashboard",
    async () => {
      // 1. Sales & Revenue
      const validOrders = await db
        .select()
        .from(orders)
        .where(ne(orders.status, "CANCELLED"));

      const totalSalesRevenue = validOrders.reduce(
        (sum, o) => sum + Number(o.subtotalAmount),
        0
      );
      const totalVatCollected = validOrders.reduce((sum, o) => sum + Number(o.taxAmount), 0);
      const totalOutstandingCredit = validOrders.reduce(
        (sum, o) => sum + Number(o.outstandingBalance),
        0
      );

      // 2. Total Cash / Payments Collected
      const completedPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.status, "COMPLETED"));

      const totalCashCollected = completedPayments.reduce(
        (sum, p) => sum + Number(p.amount),
        0
      );

      // 3. Gross Profit & COGS (from order_items snapshots)
      const allOrderItems = await db
        .select({
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          costPriceSnapshot: orderItems.costPriceSnapshot,
        })
        .from(orderItems)
        .leftJoin(orders, eq(orderItems.orderId, orders.id))
        .where(ne(orders.status, "CANCELLED"));

      let totalCOGS = 0;
      let totalGrossProfit = 0;

      for (const item of allOrderItems) {
        const cost = Number(item.costPriceSnapshot) * item.quantity;
        const revenue = Number(item.unitPrice) * item.quantity;
        totalCOGS += cost;
        totalGrossProfit += revenue - cost;
      }

      const grossMarginPercent =
        totalSalesRevenue > 0
          ? ((totalGrossProfit / totalSalesRevenue) * 100).toFixed(1)
          : "0.0";

      // 4. Low-Stock Alert Count
      const stockBalances = await db
        .select({
          minStockThreshold: products.minStockThreshold,
          availableStock: sql<number>`COALESCE(${inventoryBalances.goodPhysicalQuantity}, 0) - COALESCE(${inventoryBalances.reservedQuantity}, 0)`,
        })
        .from(products)
        .leftJoin(inventoryBalances, eq(products.id, inventoryBalances.productId))
        .where(eq(products.status, "ACTIVE"));

      const lowStockCount = stockBalances.filter(
        (b) => Number(b.availableStock) <= b.minStockThreshold
      ).length;

      return {
        success: true,
        data: {
          salesRevenue: totalSalesRevenue.toFixed(2),
          vatCollected: totalVatCollected.toFixed(2),
          cashCollected: totalCashCollected.toFixed(2),
          outstandingCredit: totalOutstandingCredit.toFixed(2),
          costOfGoodsSold: totalCOGS.toFixed(2),
          grossProfit: totalGrossProfit.toFixed(2),
          grossMarginPercent: `${grossMarginPercent}%`,
          ordersCount: validOrders.length,
          lowStockAlertsCount: lowStockCount,
        },
      };
    },
    {
      detail: {
        tags: ["Reports"],
        summary: "Executive business performance dashboard with WAC gross profit",
      },
    }
  )

  // 2. Export Inventory Balances as CSV
  .get(
    "/inventory/export",
    async ({ set }) => {
      const rows = await db
        .select({
          sku: products.sku,
          name: products.name,
          unitOfMeasure: products.unitOfMeasure,
          costPrice: products.costPrice,
          retailPrice: products.retailPrice,
          goodStock: sql<number>`COALESCE(${inventoryBalances.goodPhysicalQuantity}, 0)`,
          reservedStock: sql<number>`COALESCE(${inventoryBalances.reservedQuantity}, 0)`,
          availableStock: sql<number>`COALESCE(${inventoryBalances.goodPhysicalQuantity}, 0) - COALESCE(${inventoryBalances.reservedQuantity}, 0)`,
          damagedStock: sql<number>`COALESCE(${inventoryBalances.damagedQuantity}, 0)`,
          threshold: products.minStockThreshold,
        })
        .from(products)
        .leftJoin(inventoryBalances, eq(products.id, inventoryBalances.productId))
        .orderBy(products.name);

      const header = "SKU,Product Name,Unit,Average Cost (ETB),Retail Price (ETB),Good Stock,Reserved,Available,Damaged,Threshold,Inventory Value (ETB)\n";
      const csvRows = rows.map((r) => {
        const available = Number(r.availableStock);
        const invValue = (Number(r.goodStock) * Number(r.costPrice)).toFixed(2);
        return `"${r.sku}","${r.name.replace(/"/g, '""')}","${r.unitOfMeasure}",${r.costPrice},${r.retailPrice},${r.goodStock},${r.reservedStock},${available},${r.damagedStock},${r.threshold},${invValue}`;
      });

      const csvContent = header + csvRows.join("\n");

      set.headers["Content-Type"] = "text/csv; charset=utf-8";
      set.headers["Content-Disposition"] = 'attachment; filename="inventory-report.csv"';
      return csvContent;
    },
    {
      detail: {
        tags: ["Reports"],
        summary: "Download inventory balances and valuation as CSV",
      },
    }
  )

  // 3. Export Sales Report as CSV
  .get(
    "/sales/export",
    async ({ set }) => {
      const rows = await db
        .select({
          orderNumber: orders.orderNumber,
          date: orders.orderDate,
          customerName: customers.name,
          orderType: orders.orderType,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          subtotal: orders.subtotalAmount,
          tax: orders.taxAmount,
          total: orders.totalAmount,
          balance: orders.outstandingBalance,
        })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .orderBy(desc(orders.orderDate));

      const header = "Order Number,Date,Customer,Type,Status,Payment Status,Net Subtotal (ETB),VAT (ETB),Total (ETB),Outstanding Balance (ETB)\n";
      const csvRows = rows.map((r) => {
        const cust = r.customerName ? `"${r.customerName.replace(/"/g, '""')}"` : "Walk-in";
        const dateStr = r.date.toISOString().slice(0, 10);
        return `"${r.orderNumber}",${dateStr},${cust},${r.orderType},${r.status},${r.paymentStatus},${r.subtotal},${r.tax},${r.total},${r.balance}`;
      });

      const csvContent = header + csvRows.join("\n");

      set.headers["Content-Type"] = "text/csv; charset=utf-8";
      set.headers["Content-Disposition"] = 'attachment; filename="sales-report.csv"';
      return csvContent;
    },
    {
      detail: {
        tags: ["Reports"],
        summary: "Download sales orders report as CSV",
      },
    }
  );
