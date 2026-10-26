import { Elysia } from "elysia";
import { swaggerPlugin } from "./plugins/swagger";
import { corsPlugin } from "./plugins/cors";
import { categoriesController } from "./modules/categories/categories.controller";
import { productsController } from "./modules/products/products.controller";
import { suppliersController } from "./modules/suppliers/suppliers.controller";
import { inventoryController } from "./modules/inventory/inventory.controller";
import { customersController } from "./modules/customers/customers.controller";
import { ordersController } from "./modules/orders/orders.controller";
import { paymentsController } from "./modules/payments/payments.controller";
import { returnsController } from "./modules/returns/returns.controller";
import { reportsController } from "./modules/reports/reports.controller";

const port = Number(process.env.PORT) || 3001;

export const app = new Elysia()
  .use(corsPlugin)
  .use(swaggerPlugin)
  .get(
    "/health",
    () => ({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "order-inventory-api",
      version: "1.0.0",
    }),
    {
      detail: {
        tags: ["Health"],
        summary: "Server Health Check",
      },
    }
  )
  .group("/api/v1", (app) =>
    app
      .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
      .use(categoriesController)
      .use(productsController)
      .use(suppliersController)
      .use(inventoryController)
      .use(customersController)
      .use(ordersController)
      .use(paymentsController)
      .use(returnsController)
      .use(reportsController)
  )
  .listen(port);

console.log(`🚀 API Server running at http://localhost:${port}`);
console.log(`📑 Interactive Swagger Docs available at http://localhost:${port}/docs`);

export type App = typeof app;
