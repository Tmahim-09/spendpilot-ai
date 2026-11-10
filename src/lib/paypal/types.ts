import { z } from "zod";

export type DemoSellerId = "seller_a" | "seller_b";

export interface DemoSellerConfig {
  id: DemoSellerId;
  displayName: string;
  description: string;
  merchantId: string;
  email?: string;
}

export interface DemoProduct {
  skuId: string;
  sellerId: DemoSellerId;
  title: string;
  description: string;
  priceMinor: number; // Stored in cents (e.g. 14900 = $149.00)
  imageUrl: string;
  badge?: string;
}

export const createOrderCartItemSchema = z.object({
  skuId: z.string().min(1, "SKU ID is required"),
  quantity: z.number().int().positive().max(50, "Quantity cannot exceed 50"),
});

export type CreateOrderCartItem = z.infer<typeof createOrderCartItemSchema>;

export const createOrderRequestSchema = z.object({
  items: z.array(createOrderCartItemSchema).min(1, "Cart cannot be empty"),
});

export type CreateOrderRequestPayload = z.infer<typeof createOrderRequestSchema>;

export interface CreateOrderResponsePayload {
  success: boolean;
  orderId?: string;
  checkoutToken?: string;
  sellerMerchantIds?: string[];
  totalMinor?: number;
  currency?: string;
  error?: string;
}

export const captureOrderRequestSchema = z.object({
  orderId: z.string().min(1, "PayPal Order ID is required"),
  checkoutToken: z.string().min(1, "Checkout token is required"),
});

export type CaptureOrderRequestPayload = z.infer<typeof captureOrderRequestSchema>;

export type CaptureStatus =
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "DECLINED"
  | "FAILED"
  | "PENDING";

export interface SellerCaptureResult {
  sellerId: DemoSellerId;
  sellerName: string;
  merchantId: string;
  referenceId: string;
  subtotalMinor: number;
  currency: string;
  status: CaptureStatus;
  captureId?: string;
  errorMessage?: string;
}

export interface CaptureOrderResponsePayload {
  success: boolean;
  orderId: string;
  overallStatus: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  sellerCaptures: SellerCaptureResult[];
  totalMinor: number;
  currency: string;
  error?: string;
}

export interface PayPalCheckoutContextPayload {
  orderId: string;
  sellerMerchantIds: string[];
  totalMinor: number;
  currency: string;
  timestamp: number;
}

export interface PublicPayPalConfig {
  clientId: string;
  environment: "sandbox";
  sellers: Array<{
    id: DemoSellerId;
    displayName: string;
    merchantId: string;
  }>;
}

