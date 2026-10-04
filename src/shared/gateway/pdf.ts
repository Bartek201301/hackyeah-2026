import "server-only";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { Citation } from "@/shared/contracts";

// A fresh PDF for the public export (technical-spec §7): only the checked, rewritten answer and its
// sources, one standard font, no original pages, attachments, annotations, scripts or layers. Metadata is
// the product title and the generation time only; pdf-lib's default Producer/Creator are never written.
// ponytail: plain A4 text layout; a richer template is out of scope.

export const PDF_TITLE = "InterLock public summary";
const WIDTH = 90;
const SIZE = 11;
const LEADING = 15;
const MARGIN = 56;
const [A4_W, A4_H] = [595.28, 841.89];

/** Helvetica is WinAnsi: accents fold to ASCII, anything else outside printable ASCII is dropped. */
const printable = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "");

/** Greedy word wrap at `width` characters; a longer word is split. */
export function wrap(text: string, width = WIDTH): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (word.length > width) {
        if (line) lines.push(line);
        lines.push(word.slice(0, width));
        word = word.slice(width);
        line = "";
      }
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}

/** The exact text placed in the PDF: the answer, then the numbered sources (label, date, period). */
export function exportText(answer: string, citations: readonly Citation[]): string {
  const sources = citations.map((c, i) => `[${i + 1}] ${c.source_label}, ${c.source_date}, ${c.period}`);
  return printable([answer.trim(), "", "Sources", ...(sources.length ? sources : ["(none)"])].join("\n"));
}

/** `text` is what was drawn, so its hash in the exports row describes the file. */
export async function renderPdf(answer: string, citations: readonly Citation[], now: Date) {
  const text = exportText(answer, citations);
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(PDF_TITLE);
  doc.setCreationDate(now);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const perPage = Math.floor((A4_H - 2 * MARGIN) / LEADING);
  const lines = wrap(text);
  for (let i = 0; i < lines.length; i += perPage) {
    const page = doc.addPage([A4_W, A4_H]);
    lines.slice(i, i + perPage).forEach((line, n) => {
      if (line) page.drawText(line, { x: MARGIN, y: A4_H - MARGIN - n * LEADING, size: SIZE, font });
    });
  }
  return { bytes: await doc.save(), text };
}
