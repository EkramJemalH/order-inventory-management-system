import { describe, it, expect } from "bun:test";
import { app } from "../src/index";

describe("Order & Inventory Management API — Core Business Logic Tests", () => {
  let categoryId: string;
  let productId: string;
  let supplierId: string;
  let orderId: string;
  const uniqueSku = `TEST-SKU-${Date.now()}`;
  const receiptNum1 = `RCPT-${Date.now()}-1`;
  const receiptNum2 = `RCPT-${Date.now()}-2`;

  // 1. Health Check
  it("GET /health should return status ok", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("order-inventory-api");
  });

  // 2. Category Creation
  it("POST /api/v1/categories creates category", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Test Category ${Date.now()}`,
          slug: `test-cat-${Date.now()}`,
          description: "Category for automated testing",
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    categoryId = body.data.id;
  });

  // 3. Product Registration & Unique SKU
  it("POST /api/v1/products creates product with zero initial stock", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: uniqueSku,
          name: "Test Cotton Polo",
          categoryId,
          retailPrice: 500,
          defaultWholesalePrice: 450,
          minStockThreshold: 5,
          isTaxable: true,
          taxRate: 0.15,
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.sku).toBe(uniqueSku);
    productId = body.data.id;

    // Verify stock is initialized to 0
    const checkRes = await app.handle(new Request(`http://localhost/api/v1/products/${productId}`));
    const checkBody = await checkRes.json();
    expect(checkBody.data.goodPhysicalStock).toBe(0);
    expect(checkBody.data.availableStock).toBe(0);
    expect(checkBody.data.inventoryAlert).toBe("OUT_OF_STOCK");
  });

  it("POST /api/v1/products rejects duplicate SKU", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: uniqueSku, // Duplicate
          name: "Another Product",
          retailPrice: 200,
          defaultWholesalePrice: 150,
        }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("already exists");
  });

  // 4. Supplier Registration
  it("POST /api/v1/suppliers registers supplier", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Ethiopian Textile Corp ${Date.now()}`,
          phone: "+251911998877",
          contactPerson: "Tadesse",
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    supplierId = body.data.id;
  });

  // 5. Inbound Receipt & Moving Weighted-Average Costing (WAC)
  it("POST /api/v1/inventory/receipts: Receipt 1 (10 units @ 100 ETB) sets WAC cost to 100", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/inventory/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptNumber: receiptNum1,
          supplierId,
          items: [
            {
              productId,
              quantityReceived: 10,
              unitCost: 100,
            },
          ],
        }),
      })
    );
    expect(res.status).toBe(201);

    const prodRes = await app.handle(new Request(`http://localhost/api/v1/products/${productId}`));
    const prodBody = await prodRes.json();
    expect(Number(prodBody.data.costPrice)).toBe(100);
    expect(prodBody.data.goodPhysicalStock).toBe(10);
    expect(prodBody.data.availableStock).toBe(10);
  });

  it("POST /api/v1/inventory/receipts: Receipt 2 (10 units @ 150 ETB) dynamically updates WAC to 125 ETB", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/inventory/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptNumber: receiptNum2,
          supplierId,
          items: [
            {
              productId,
              quantityReceived: 10,
              unitCost: 150,
            },
          ],
        }),
      })
    );
    expect(res.status).toBe(201);

    // Calculation: (10 * 100 + 10 * 150) / 20 = 2500 / 20 = 125.00 ETB
    const prodRes = await app.handle(new Request(`http://localhost/api/v1/products/${productId}`));
    const prodBody = await prodRes.json();
    expect(Number(prodBody.data.costPrice)).toBe(125);
    expect(prodBody.data.goodPhysicalStock).toBe(20);
    expect(prodBody.data.availableStock).toBe(20);
  });

  // 6. Out-of-Stock Sale Protection
  it("POST /api/v1/orders rejects sale when requested quantity exceeds available stock", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType: "IN_STORE",
          items: [
            {
              productId,
              quantity: 100, // Only 20 available!
              unitPrice: 500,
            },
          ],
        }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Insufficient stock");
  });

  // 7. Atomic In-Store Checkout & Cost Snapshots
  it("POST /api/v1/orders completes in-store sale, deducts stock, and snapshots WAC cost & VAT", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType: "IN_STORE",
          initialPaymentAmount: 1000,
          paymentMethod: "CASH",
          items: [
            {
              productId,
              quantity: 5,
              unitPrice: 500,
            },
          ],
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    orderId = body.data.id;

    // Total: 5 * 500 = 2500 subtotal, 15% VAT = 375, total = 2875. Paid 1000 -> remaining 1875
    expect(Number(body.data.subtotalAmount)).toBe(2500);
    expect(Number(body.data.taxAmount)).toBe(375);
    expect(Number(body.data.totalAmount)).toBe(2875);
    expect(Number(body.data.outstandingBalance)).toBe(1875);
    expect(body.data.paymentStatus).toBe("PARTIALLY_PAID");
    expect(body.data.fulfilmentStatus).toBe("HANDED_OVER");

    // Stock was 20, should now be 15
    const prodRes = await app.handle(new Request(`http://localhost/api/v1/products/${productId}`));
    const prodBody = await prodRes.json();
    expect(prodBody.data.goodPhysicalStock).toBe(15);
    expect(prodBody.data.availableStock).toBe(15);

    // Verify order item snapshots
    const orderDetailsRes = await app.handle(new Request(`http://localhost/api/v1/orders/${orderId}`));
    const orderDetails = await orderDetailsRes.json();
    expect(orderDetails.data.items[0].costPriceSnapshot).toBe("125.00");
    expect(orderDetails.data.items[0].taxRateSnapshot).toBe("0.15");
  });

  // 8. Partial Payment & Credit Settlement
  it("POST /api/v1/payments records subsequent installment and updates outstanding balance", async () => {
    // Current outstanding balance is 1875 ETB. Customer pays 1000 ETB.
    const res = await app.handle(
      new Request("http://localhost/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          amount: 1000,
          method: "MOBILE_MONEY",
          transactionReference: "CBE-TX-12345",
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.newOutstanding).toBe(875);
    expect(body.data.newPaymentStatus).toBe("PARTIALLY_PAID");

    // Pay remaining 875 ETB -> status should change to PAID
    const settleRes = await app.handle(
      new Request("http://localhost/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          amount: 875,
          method: "CASH",
        }),
      })
    );
    expect(settleRes.status).toBe(201);
    const settleBody = await settleRes.json();
    expect(settleBody.data.newOutstanding).toBe(0);
    expect(settleBody.data.newPaymentStatus).toBe("PAID");
  });

  it("POST /api/v1/payments rejects payment on already settled order", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          amount: 50,
          method: "CASH",
        }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("already fully paid");
  });

  // 9. Manual Authorized Stock Adjustment
  it("POST /api/v1/inventory/adjust adjusts physical stock and appends movement", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          quantityDelta: -2,
          reason: "Damaged in store display",
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.before).toBe(15);
    expect(body.data.after).toBe(13);

    // Verify in products balance
    const prodRes = await app.handle(new Request(`http://localhost/api/v1/products/${productId}`));
    const prodBody = await prodRes.json();
    expect(prodBody.data.goodPhysicalStock).toBe(13);
  });

  // 10. Dashboard Reports & CSV Export
  it("GET /api/v1/reports/dashboard returns valid calculations", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/reports/dashboard"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Number(body.data.salesRevenue)).toBeGreaterThan(0);
    expect(Number(body.data.grossProfit)).toBeGreaterThan(0);
  });

  it("GET /api/v1/reports/inventory/export streams valid CSV", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/reports/inventory/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv).toContain("SKU,Product Name,Unit");
    expect(csv).toContain(uniqueSku);
  });

  // 11. Delivery Order, Reservation, Dispatch & Handover
  it("Delivery Order workflow: reserves stock, dispatches physical stock, and marks delivered", async () => {
    // Current good physical stock is 13. Create delivery order for 3 units.
    const createRes = await app.handle(
      new Request("http://localhost/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType: "DELIVERY",
          deliveryAddress: "Bole Medhanialem, House 402",
          items: [{ productId, quantity: 3, unitPrice: 500 }],
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const orderData = (await createRes.json()).data;
    const deliveryOrderId = orderData.id;

    // Physical stock remains 13, but reservedStock is 3, availableStock is 10!
    let prodCheck = (await (await app.handle(new Request(`http://localhost/api/v1/products/${productId}`))).json()).data;
    expect(prodCheck.goodPhysicalStock).toBe(13);
    expect(prodCheck.reservedStock).toBe(3);
    expect(prodCheck.availableStock).toBe(10);

    // Dispatch order -> Physical stock decreases to 10, reservation released!
    const dispatchRes = await app.handle(
      new Request(`http://localhost/api/v1/orders/${deliveryOrderId}/fulfilment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DISPATCHED" }),
      })
    );
    expect(dispatchRes.status).toBe(200);

    prodCheck = (await (await app.handle(new Request(`http://localhost/api/v1/products/${productId}`))).json()).data;
    expect(prodCheck.goodPhysicalStock).toBe(10);
    expect(prodCheck.reservedStock).toBe(0);
    expect(prodCheck.availableStock).toBe(10);

    // Complete delivery
    const deliverRes = await app.handle(
      new Request(`http://localhost/api/v1/orders/${deliveryOrderId}/fulfilment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DELIVERED" }),
      })
    );
    expect(deliverRes.status).toBe(200);
    const deliverData = (await deliverRes.json()).data;
    expect(deliverData.fulfilmentStatus).toBe("DELIVERED");
    expect(deliverData.status).toBe("COMPLETED");
  });

  // 12. Return Request, Inspection, Restocking & Refund
  it("Returns workflow: submits return, inspects item for restock, and issues refund", async () => {
    // Get an order item to return from the original order
    const orderDetailsRes = await app.handle(new Request(`http://localhost/api/v1/orders/${orderId}`));
    const orderItem = (await orderDetailsRes.json()).data.items[0];

    // Submit return for 1 unit
    const returnSubmitRes = await app.handle(
      new Request("http://localhost/api/v1/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          items: [
            {
              orderItemId: orderItem.id,
              productId: orderItem.productId,
              quantity: 1,
              reason: "Size did not fit",
            },
          ],
        }),
      })
    );
    expect(returnSubmitRes.status).toBe(201);
    const returnBody = await returnSubmitRes.json();
    const returnRequestId = returnBody.data.returnRequest.id;
    const returnItemId = returnBody.data.items[0].id;

    // Inspect item and approve for RESTOCK
    const inspectRes = await app.handle(
      new Request(`http://localhost/api/v1/returns/${returnRequestId}/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnItemId,
          disposition: "RESTOCKED",
          conditionNotes: "Tags still attached, original packaging verified",
          refundAmount: 500,
        }),
      })
    );
    expect(inspectRes.status).toBe(200);

    // Good physical stock was 10, now should increase back to 11!
    const prodCheck = (await (await app.handle(new Request(`http://localhost/api/v1/products/${productId}`))).json()).data;
    expect(prodCheck.goodPhysicalStock).toBe(11);

    // Issue refund
    const refundRes = await app.handle(
      new Request(`http://localhost/api/v1/returns/${returnRequestId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 500,
          method: "CASH",
          notes: "Refunded cash at front desk",
        }),
      })
    );
    expect(refundRes.status).toBe(201);
    const refundBody = await refundRes.json();
    expect(refundBody.success).toBe(true);
  });
});

