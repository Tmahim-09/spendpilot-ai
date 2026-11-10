import { NextResponse } from "next/server";
import { retrieveProductVariants } from "@/lib/channel3/variants";
import type {
  ProductVariantRequestPayload,
  ProductVariantResponsePayload,
} from "@/types";

export const maxDuration = 20;

export async function POST(req: Request) {
  try {
    const body: ProductVariantRequestPayload = await req.json();

    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!productId) {
      return NextResponse.json(
        {
          success: false,
          error: "Valid productId is required to resolve product variants.",
        },
        { status: 400 }
      );
    }

    const selectedOptions = body.selectedOptions || {};
    const currency = body.currency || "USD";
    const retailerUrl = typeof body.retailerUrl === "string" ? body.retailerUrl.trim() : undefined;

    const variantState = await retrieveProductVariants(productId, selectedOptions, currency, retailerUrl);

    const payload: ProductVariantResponsePayload = {
      success: true,
      variantState,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to resolve product variants";
    return NextResponse.json(
      {
        success: false,
        variantState: null,
        error: message,
      },
      { status: 500 }
    );
  }
}

