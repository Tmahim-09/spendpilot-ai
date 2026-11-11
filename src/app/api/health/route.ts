import { NextResponse } from "next/server";

export async function GET(req?: Request) {
  if (req) {
    void req.headers.get("accept");
  }

  const commit = process.env.VERCEL_GIT_COMMIT_SHA
    ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
    : null;

  const environment =
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development";

  return NextResponse.json(
    {
      status: "ok",
      application: "SpendPilot AI",
      runtime: process.version,
      environment,
      commit,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
