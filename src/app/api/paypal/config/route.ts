import { NextResponse } from "next/server";
import { getPublicPayPalConfig } from "@/lib/paypal/config";

export async function GET(req?: Request) {
  if (req) {
    void req.headers.get("accept");
  }
  try {
    const publicConfig = getPublicPayPalConfig();
    return NextResponse.json(publicConfig, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
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
