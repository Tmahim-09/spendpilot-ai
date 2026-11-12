import { NextResponse } from "next/server";
import { captureOrderRequestSchema } from "@/lib/paypal/types";
import { captureMultiSellerOrder } from "@/lib/paypal/orders-service";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parseResult = captureOrderRequestSchema.safeParse(body);

    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid capture payload",
        },
        { status: 400 }
      );
    }

    const captureResult = await captureMultiSellerOrder({
      orderId: parseResult.data.orderId,
      checkoutToken: parseResult.data.checkoutToken,
    });

    return NextResponse.json(captureResult, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to capture multi-seller order";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 400 }
    );
  }
}

