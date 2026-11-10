import { NextResponse } from "next/server";
import { getPublicPayPalConfig } from "@/lib/paypal/config";

export async function GET() {
  try {
    const publicConfig = getPublicPayPalConfig();
    return NextResponse.json(publicConfig, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load PayPal configuration";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}

