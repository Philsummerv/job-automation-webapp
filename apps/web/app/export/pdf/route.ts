import { NextResponse, type NextRequest } from "next/server";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { requireEntitled } from "@/lib/auth";
import { getPeriodEntries, periodRange } from "@/lib/export";
import {
  formatPeriodRange,
  methodLabel,
  resultLabel,
  US_STATES,
  type ActivityLogEntry,
  type Profile,
} from "@applyassistui/shared";

export const runtime = "nodejs";

// Standard PDF fonts use WinAnsi (CP1252) encoding. Map common smart
// punctuation to ASCII and drop anything outside the encodable range so
// arbitrary user notes can never throw during rendering.
function sanitize(input: string): string {
  return (input || "")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .split("")
    .map((ch) => {
      const c = ch.charCodeAt(0);
      if (c === 9 || c === 10 || c === 13) return " ";
      if (c < 32) return "";
      if (c >= 127 && c <= 159) return "?";
      if (c > 255) return "?";
      return ch;
    })
    .join("");
}

function fitText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  let t = sanitize(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "...";
}

async function buildPdf(
  entries: ActivityLogEntry[],
  profile: Profile,
  periodKey: string,
  claimant: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 40;
  const TABLE_W = PAGE_W - MARGIN * 2; // 532
  const stateName =
    US_STATES.find((s) => s[0] === profile.state)?.[1] ?? profile.state ?? "";
  const { start } = periodRange(periodKey);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const draw = (
    text: string,
    x: number,
    yy: number,
    size: number,
    f: PDFFont = font,
    color = rgb(0.1, 0.1, 0.1),
  ) => page.drawText(sanitize(text), { x, y: yy, size, font: f, color });

  // Column layout.
  const cols = [
    { label: "Date", w: 62 },
    { label: "Employer / Title", w: 176 },
    { label: "Method", w: 70 },
    { label: "Result", w: 66 },
    { label: "URL / Notes", w: 158 },
  ];
  const xDate = MARGIN + 4;
  const xEmp = MARGIN + cols[0].w + 4;
  const xMethod = MARGIN + cols[0].w + cols[1].w + 4;
  const xResult = xMethod + cols[2].w;
  const xUrl = xResult + cols[3].w;

  const drawHeaderRow = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - 16,
      width: TABLE_W,
      height: 18,
      color: rgb(0.93, 0.95, 0.98),
    });
    let x = MARGIN + 4;
    for (const c of cols) {
      draw(c.label, x, y - 12, 8.5, bold, rgb(0.2, 0.2, 0.3));
      x += c.w;
    }
    y -= 18;
  };

  // ── Header block ──
  draw("Work Search Activity Log", MARGIN, y - 4, 18, bold, rgb(0.12, 0.16, 0.3));
  y -= 26;
  draw(`Claimant: ${claimant}`, MARGIN, y, 10);
  y -= 14;
  if (stateName) {
    draw(`State: ${stateName}`, MARGIN, y, 10);
    y -= 14;
  }
  draw(`Reporting week: ${formatPeriodRange(start)}`, MARGIN, y, 10);
  y -= 14;
  const met = entries.length >= profile.weekly_target;
  draw(
    `Activities recorded: ${entries.length}   (requirement: ${profile.weekly_target}${met ? " — met" : ""})`,
    MARGIN,
    y,
    10,
    bold,
    met ? rgb(0.1, 0.5, 0.2) : rgb(0.6, 0.4, 0),
  );
  y -= 22;

  drawHeaderRow();

  const ROW_H = 30;
  const BOTTOM = MARGIN + 24;

  if (entries.length === 0) {
    draw("No activities recorded for this week.", xDate, y - 12, 9, font, rgb(0.5, 0.5, 0.5));
    y -= 20;
  }

  for (const e of entries) {
    if (y - ROW_H < BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      drawHeaderRow();
    }
    draw(fitText(e.date, font, 8.5, cols[0].w - 6), xDate, y - 11, 8.5);
    draw(fitText(e.employer_name, bold, 8.5, cols[1].w - 6), xEmp, y - 11, 8.5, bold);
    if (e.job_title) {
      draw(fitText(e.job_title, font, 8, cols[1].w - 6), xEmp, y - 22, 8, font, rgb(0.4, 0.4, 0.4));
    }
    draw(fitText(methodLabel(e.method), font, 8.5, cols[2].w - 6), xMethod, y - 11, 8.5);
    draw(fitText(resultLabel(e.result), font, 8.5, cols[3].w - 6), xResult, y - 11, 8.5);
    if (e.url) {
      draw(fitText(e.url, font, 7.5, cols[4].w - 6), xUrl, y - 11, 7.5, font, rgb(0.15, 0.3, 0.7));
    }
    if (e.notes) {
      draw(fitText(e.notes, font, 7.5, cols[4].w - 6), xUrl, y - 22, 7.5, font, rgb(0.4, 0.4, 0.4));
    }
    page.drawLine({
      start: { x: MARGIN, y: y - ROW_H + 2 },
      end: { x: MARGIN + TABLE_W, y: y - ROW_H + 2 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= ROW_H;
  }

  // Footer disclaimer on the last page.
  draw(
    fitText(
      "Generated by ApplyAssistUI, a user-directed job-search documentation tool. The claimant is responsible for the accuracy of this record.",
      font,
      7.5,
      TABLE_W,
    ),
    MARGIN,
    MARGIN - 8,
    7.5,
    font,
    rgb(0.5, 0.5, 0.5),
  );

  return doc.save();
}

export async function GET(request: NextRequest) {
  const { supabase, user, profile } = await requireEntitled();
  const period = request.nextUrl.searchParams.get("period");
  if (!period || !/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "Missing or invalid ?period" }, { status: 400 });
  }

  const entries = await getPeriodEntries(supabase, period);
  const claimant = profile.full_name || user.email || "Claimant";
  const bytes = await buildPdf(entries, profile, period, claimant);

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="job-search-log-${period}.pdf"`,
    },
  });
}
