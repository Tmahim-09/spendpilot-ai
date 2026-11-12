import { NextResponse } from "next/server";
import { createOrderRequestSchema } from "@/lib/paypal/types";
import { createMultiSellerOrder } from "@/lib/paypal/orders-service";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parseResult = createOrderRequestSchema.safeParse(body);

    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid order payload",
        },
        { status: 400 }
      );
    }

    const idempotencyKey = req.headers.get("x-idempotency-key") || undefined;
    const orderResult = await createMultiSellerOrder({
      items: parseResult.data.items,
      idempotencyKey,
    });

    return NextResponse.json(orderResult, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create multi-seller order";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 400 }
    );
  }
}

