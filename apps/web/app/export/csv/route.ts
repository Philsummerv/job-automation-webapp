import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getPeriodEntries, toCsv } from "@/lib/export";

export async function GET(request: NextRequest) {
  const { supabase } = await requireUser();
  const period = request.nextUrl.searchParams.get("period");
  if (!period || !/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "Missing or invalid ?period" }, { status: 400 });
  }

  const entries = await getPeriodEntries(supabase, period);
  const csv = toCsv(entries);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="job-search-log-${period}.csv"`,
    },
  });
}
