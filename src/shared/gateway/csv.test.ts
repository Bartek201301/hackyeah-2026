import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

const limits = { max_csv_rows: 2, max_text_chars: 24000 };
const HEADER = "text,source_date,period,unit,fact_key,basis";
const ROW = "AsterCloud revenue is USD 120 million.,2026-03-15,FY2025,USD million,revenue,actual";
const fixture = (alias: string) => readFileSync(`docs/demo/uploads/${alias}.csv`, "utf8");

describe("parseCsv", () => {
  it("parses the exact header and keeps a quoted newline inside text", () => {
    const out = parseCsv(
      `${HEADER}\n"Line one.\nLine two, with a comma.",2026-03-15,FY2025,USD million,revenue,actual\n`,
      limits,
    );
    expect(out).toEqual({
      rows: [
        {
          n: 1,
          row: {
            text: "Line one.\nLine two, with a comma.",
            source_date: "2026-03-15",
            period: "FY2025",
            unit: "USD million",
            fact_key: "revenue",
            basis: "actual",
          },
        },
      ],
    });
  });

  it("fails on a header out of order, a missing header or an empty file", () => {
    expect(parseCsv(`source_date,text,period,unit,fact_key,basis\n${ROW}\n`, limits)).toEqual({
      locator: "header",
    });
    expect(parseCsv(`${ROW}\n`, limits)).toEqual({ locator: "header" });
    expect(parseCsv("", limits)).toEqual({ locator: "header" });
    expect(parseCsv(`${HEADER}\n`, limits)).toEqual({ locator: "file" });
  });

  it("fails on an extra column in the header or in a row", () => {
    expect(parseCsv(`${HEADER},secret\n${ROW},x\n`, limits)).toEqual({ locator: "header" });
    expect(parseCsv(`${HEADER}\n${ROW},x\n`, limits)).toEqual({ locator: "line:2" });
  });

  it("fails above max_csv_rows instead of truncating", () => {
    expect(parseCsv([HEADER, ROW, ROW, ROW].join("\n"), limits)).toEqual({ locator: "row:3" });
  });

  it("fails a row that breaks the row schema, with its row locator", () => {
    expect(parseCsv(`${HEADER}\n${ROW}\n${ROW.replace("actual", "rumour")}\n`, limits)).toEqual({
      locator: "row:2",
    });
    expect(parseCsv(`${HEADER}\n${ROW.replace("FY2025", "")}\n`, limits)).toEqual({ locator: "row:1" });
  });

  it("parses the committed MIX-01 and REV-01 upload fixtures", () => {
    const mix = parseCsv(fixture("MIX-01"), limits);
    expect("rows" in mix && mix.rows.map((r) => r.row.text.split("\n").length)).toEqual([4]);
    expect("rows" in mix && mix.rows[0].row).toMatchObject({ period: "2026-Q4", fact_key: "sales_pipeline" });
    const rev = parseCsv(fixture("REV-01"), limits);
    expect("rows" in rev && rev.rows[0].row).toMatchObject({ fact_key: "webinar", basis: "event" });
  });
});
