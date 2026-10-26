import { swagger } from "@elysiajs/swagger";

export const swaggerPlugin = swagger({
  documentation: {
    info: {
      title: "Order & Inventory Management API",
      version: "1.0.0",
      description: "Modular REST API for Orders and Inventory Management built with Elysia and Bun",
    },
    tags: [
      { name: "Health", description: "Health check endpoints" },
      { name: "Products", description: "Product catalog and stock management" },
      { name: "Orders", description: "Customer order processing" },
    ],
  },
  path: "/docs",
});
