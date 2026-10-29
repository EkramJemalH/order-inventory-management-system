import { db, categories, suppliers, customers, products, inventoryBalances, stockReceipts, stockReceiptItems, stockMovements } from "./index";
import { users, accounts } from "./schema/users";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Starting Database Seed for Ethiopian Order & Inventory System...");

  // 1. Initial Admin Owner & Staff
  const adminEmail = "owner@ethioshop.et";
  const existingOwner = await db.select().from(users).where(eq(users.email, adminEmail));

  let ownerId = existingOwner[0]?.id;
  if (!existingOwner.length) {
    ownerId = "owner-seed-uuid-001";
    await db.insert(users).values({
      id: ownerId,
      name: "Abebe Bikila (Shop Owner)",
      email: adminEmail,
      role: "ADMIN",
      status: "ACTIVE",
      emailVerified: true,
    });
    console.log("✅ Seeded Admin Owner:", adminEmail);
  }

  const staffEmail = "sales@ethioshop.et";
  const existingStaff = await db.select().from(users).where(eq(users.email, staffEmail));
  if (!existingStaff.length) {
    await db.insert(users).values({
      id: "staff-seed-uuid-002",
      name: "Tirunesh Dibaba (Sales Staff)",
      email: staffEmail,
      role: "SALES_STAFF",
      status: "ACTIVE",
      emailVerified: true,
    });
    console.log("✅ Seeded Sales Staff:", staffEmail);
  }

  // 2. Categories
  const sampleCategories = [
    { name: "Textiles & Apparel", slug: "textiles-apparel", description: "Clothing, traditional Ethiopian wear, and fabrics" },
    { name: "Footwear & Shoes", slug: "footwear-shoes", description: "Leather shoes, sneakers, and sandals" },
    { name: "Electronics & Accessories", slug: "electronics-accessories", description: "Chargers, cables, audio, and small appliances" },
    { name: "Household Essentials", slug: "household-essentials", description: "Daily retail and wholesale supplies" },
  ];

  const catMap: Record<string, string> = {};
  for (const cat of sampleCategories) {
    const existing = await db.select().from(categories).where(eq(categories.slug, cat.slug));
    if (existing.length) {
      catMap[cat.slug] = existing[0].id;
    } else {
      const [inserted] = await db.insert(categories).values(cat).returning();
      catMap[cat.slug] = inserted.id;
    }
  }
  console.log("✅ Seeded Categories (4 items)");

  // 3. Suppliers
  const sampleSuppliers = [
    { name: "Addis Garment Factory PLC", contactPerson: "Almaz Ayana", phone: "+251911223344", email: "sales@addisgarment.et", paymentTermsDays: 30 },
    { name: "Anbessa Shoe Share Co.", contactPerson: "Kenenisa Bekele", phone: "+251922334455", email: "orders@anbessashoe.et", paymentTermsDays: 15 },
    { name: "Ethio-Telecom Accessories Hub", contactPerson: "Derartu Tulu", phone: "+251933445566", email: "hub@accessories.et", paymentTermsDays: 7 },
  ];

  const supplierMap: Record<string, string> = {};
  for (const sup of sampleSuppliers) {
    const existing = await db.select().from(suppliers).where(eq(suppliers.name, sup.name));
    if (existing.length) {
      supplierMap[sup.name] = existing[0].id;
    } else {
      const [inserted] = await db.insert(suppliers).values(sup).returning();
      supplierMap[sup.name] = inserted.id;
    }
  }
  console.log("✅ Seeded Suppliers (3 suppliers)");

  // 4. Customers
  const sampleCustomers = [
    { name: "Bole Wholesale Traders", phone: "+251911001122", tier: "VIP" as const, creditLimit: "100000.00", paymentTermsDays: 30, reservationDaysLimit: 7 },
    { name: "Piazza Retail Boutique", phone: "+251922112233", tier: "REGULAR" as const, creditLimit: "25000.00", paymentTermsDays: 14, reservationDaysLimit: 3 },
    { name: "Walk-in Cash Retail Customer", phone: "+251933223344", tier: "NEW" as const, creditLimit: "0.00", paymentTermsDays: 0, reservationDaysLimit: 3 },
  ];

  for (const cust of sampleCustomers) {
    const existing = await db.select().from(customers).where(eq(customers.phone, cust.phone));
    if (!existing.length) {
      await db.insert(customers).values(cust);
    }
  }
  console.log("✅ Seeded Customers (3 customers)");

  // 5. Products & Inventory
  const sampleProducts = [
    {
      sku: "HABESHA-DRESS-001",
      name: "Handwoven Habesha Kemis (Traditional)",
      categoryId: catMap["textiles-apparel"],
      unit: "piece",
      retailPrice: "3500.00",
      wholesalePrice: "2800.00",
      costPrice: "1800.00",
      isTaxable: true,
      taxRate: "0.15",
      minStockThreshold: 5,
      initialStock: 25,
      supplierName: "Addis Garment Factory PLC",
    },
    {
      sku: "LEATHER-SHOE-OXF",
      name: "Men Genuine Leather Oxford Shoes (Black)",
      categoryId: catMap["footwear-shoes"],
      unit: "pair",
      retailPrice: "2400.00",
      wholesalePrice: "1950.00",
      costPrice: "1350.00",
      isTaxable: true,
      taxRate: "0.15",
      minStockThreshold: 4,
      initialStock: 18,
      supplierName: "Anbessa Shoe Share Co.",
    },
    {
      sku: "FAST-CHARGER-65W",
      name: "Fast Charging USB-C Wall Adapter 65W",
      categoryId: catMap["electronics-accessories"],
      unit: "piece",
      retailPrice: "850.00",
      wholesalePrice: "650.00",
      costPrice: "380.00",
      isTaxable: true,
      taxRate: "0.15",
      minStockThreshold: 10,
      initialStock: 40,
      supplierName: "Ethio-Telecom Accessories Hub",
    },
  ];

  for (const prod of sampleProducts) {
    const existing = await db.select().from(products).where(eq(products.sku, prod.sku));
    if (!existing.length) {
      const [insertedProduct] = await db
        .insert(products)
        .values({
          sku: prod.sku,
          name: prod.name,
          categoryId: prod.categoryId,
          unitOfMeasure: prod.unit,
          retailPrice: prod.retailPrice,
          defaultWholesalePrice: prod.wholesalePrice,
          costPrice: prod.costPrice,
          isTaxable: prod.isTaxable,
          taxRate: prod.taxRate,
          minStockThreshold: prod.minStockThreshold,
        })
        .returning();

      // Inventory balance
      await db.insert(inventoryBalances).values({
        productId: insertedProduct.id,
        goodPhysicalQuantity: prod.initialStock,
        reservedQuantity: 0,
        damagedQuantity: 0,
        pendingInspectionQuantity: 0,
      });

      // Stock Receipt
      const receiptNumber = `RCPT-INIT-${prod.sku}`;
      const [receipt] = await db
        .insert(stockReceipts)
        .values({
          receiptNumber,
          supplierId: supplierMap[prod.supplierName],
          receivedBy: ownerId,
          totalCost: (Number(prod.costPrice) * prod.initialStock).toFixed(2),
          notes: "Initial inventory setup on boarding",
        })
        .returning();

      await db.insert(stockReceiptItems).values({
        receiptId: receipt.id,
        productId: insertedProduct.id,
        quantityReceived: prod.initialStock,
        damagedQuantityReceived: 0,
        unitCost: prod.costPrice,
        subtotalCost: (Number(prod.costPrice) * prod.initialStock).toFixed(2),
      });

      await db.insert(stockMovements).values({
        productId: insertedProduct.id,
        type: "RECEIPT",
        quantityDelta: prod.initialStock,
        physicalStockBefore: 0,
        physicalStockAfter: prod.initialStock,
        referenceType: "stock_receipt",
        referenceId: receipt.id,
        reason: "Initial warehouse stock receipt",
        performedBy: ownerId,
      });
    }
  }

  console.log("✅ Seeded Sample Products & Inbound Receipts (3 catalog items with initial stock)");
  console.log("🎉 Database seeding complete! Ready for web frontend connection.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
