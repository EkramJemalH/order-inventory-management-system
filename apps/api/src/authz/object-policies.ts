import type { AuthUser } from "./types";

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Object-level security policies for Order operations
 */
export const orderPolicy = {
  canCancel(
    order: { createdBy?: string | null; fulfilmentStatus?: string; orderStatus?: string },
    user: AuthUser
  ): PolicyResult {
    if (order.fulfilmentStatus === "DISPATCHED" || order.fulfilmentStatus === "DELIVERED") {
      return {
        allowed: false,
        reason: "Cannot cancel an order that has already been dispatched or delivered.",
      };
    }

    if (order.orderStatus === "CANCELLED") {
      return {
        allowed: false,
        reason: "Order is already cancelled.",
      };
    }

    // Admins and Managers can cancel any non-dispatched order
    if (user.role === "ADMIN" || user.role === "MANAGER") {
      return { allowed: true };
    }

    // Sales staff can cancel orders they personally created before dispatch
    if (order.createdBy && order.createdBy === user.id) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "Only a manager or the staff member who created this order may cancel it.",
    };
  },

  canDispatch(
    order: { fulfilmentStatus?: string; orderStatus?: string },
    user: AuthUser
  ): PolicyResult {
    if (order.orderStatus === "CANCELLED") {
      return {
        allowed: false,
        reason: "Cannot dispatch a cancelled order.",
      };
    }

    if (order.fulfilmentStatus === "DISPATCHED" || order.fulfilmentStatus === "DELIVERED") {
      return {
        allowed: false,
        reason: "Order is already dispatched or delivered.",
      };
    }

    const permittedRoles = ["ADMIN", "MANAGER", "INVENTORY_STAFF"];
    if (!permittedRoles.includes(user.role)) {
      return {
        allowed: false,
        reason: "Only inventory personnel or managers can dispatch goods for delivery.",
      };
    }

    return { allowed: true };
  },
};

/**
 * Object-level security policies for Inventory adjustments
 */
export const inventoryPolicy = {
  canAdjust(absQuantityDelta: number, user: AuthUser): PolicyResult {
    // Large stock variance (> 5 units) requires Manager or Admin authorization
    if (absQuantityDelta > 5 && user.role !== "ADMIN" && user.role !== "MANAGER") {
      return {
        allowed: false,
        reason: `Discrepancy of ${absQuantityDelta} units exceeds staff limit (5 units). Manager authorization required.`,
      };
    }

    return { allowed: true };
  },

  canReceiveStock(user: AuthUser): PolicyResult {
    const permittedRoles = ["ADMIN", "MANAGER", "INVENTORY_STAFF"];
    if (!permittedRoles.includes(user.role)) {
      return {
        allowed: false,
        reason: "Only inventory staff or managers can receive goods from suppliers.",
      };
    }
    return { allowed: true };
  },
};

/**
 * Object-level security policies for Financial refunds
 */
export const refundPolicy = {
  canIssueRefund(user: AuthUser): PolicyResult {
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return {
        allowed: false,
        reason: "Only managers or business owners are authorized to issue customer refunds.",
      };
    }
    return { allowed: true };
  },
};
