import { trimImportCell } from "./import-data";

/**
 * Copying a table out of a browser (a web page, or a spreadsheet that runs in one) puts an HTML
 * `<table>` on the clipboard next to a plain-text flavour that usually keeps neither the row
 * structure nor the empty cells. This module reads the markup flavour instead; `binary-import`
 * re-exports `parseHtmlTableRows` and feeds the matrix to the same header engine as a workbook.
 *
 * The markup is scanned rather than parsed into a DOM: the result must be the same in a worker or
 * in a test, and clipboard markup is never inserted into the document, so no untrusted node is
 * ever created.
 */
/**
 * A word processor lays a two-character name out to the width of a three-character one with the
 * typographic spaces, so "苏禾" reaches the clipboard as `苏&emsp;禾`. They decode to a plain space
 * like `&nbsp;` does, in time for the collapse in `htmlCellText` to fold them into the one space
 * that separates the characters — left undecoded they became part of the name itself.
 */
const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: "&", apos: "'", emsp: " ", ensp: " ", gt: ">", lt: "<", nbsp: " ", quot: '"', thinsp: " ",
};

const MAX_HTML_SPAN = 512;

/**
 * Attribute list of a start tag. A quoted value may hold a `>` — an online spreadsheet ships the
 * cell value back as JSON in `data-sheets-value`, so a destination written "本科>硕士" ends up
 * inside the attribute — and scanning to the first `>` would cut the tag in half and leak markup
 * into the cell. The alternatives cannot match the same character, so the scan stays linear.
 */
const TAG_ATTRIBUTES = "(?:[^>\"']|\"[^\"]*\"|'[^']*')*";

/**
 * Every tag that opens or closes a table, a row or a cell, in source order. The markup is walked
 * token by token over a stack of open tables, so a nested `<table>` — the layout wrapper an old
 * school page puts around its roster, or the mini table a Word export leaves inside a single cell
 * — cannot end the row that contains it. Reading a row up to the next `<tr>` did exactly that and
 * dropped every later cell of the outer row without a word.
 *
 * Hand-written markup also leaves `</td>` and `</tr>` out, which a browser fills in silently, so
 * every boundary tag closes whichever cell and row is still open.
 */
const TABLE_TOKEN = new RegExp(`<(/?)(table|thead|tbody|tfoot|tr|td|th)\\b(${TAG_ATTRIBUTES})>`, "gi");

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (!entity.startsWith("#")) return HTML_NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    const hex = entity[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match;
    return String.fromCodePoint(codePoint);
  });
}

/** Same tolerance for the inline markup wrapping the text inside a cell. */
const HTML_INNER_TAG_PATTERN = new RegExp(`</?[a-z][a-z0-9:-]*(?:\\s${TAG_ATTRIBUTES})?>`, "gi");

/** Cell text: markup and comments out, entities in, whitespace collapsed. */
function htmlCellText(cell: string): string {
  const text = cell
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(HTML_INNER_TAG_PATTERN, " ")
    .replace(/<[^>]*>/g, " ");
  return trimImportCell(decodeHtmlEntities(text).replace(/\s+/g, " "));
}

function readSpan(attributes: string, name: "colspan" | "rowspan"): number {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']?\\s*(\\d+)`, "i").exec(attributes);
  const span = match ? Number(match[1]) : 1;
  return Number.isInteger(span) && span > 0 ? Math.min(span, MAX_HTML_SPAN) : 1;
}

/** One open `<table>`: the rows it has finished, plus the row and the cell still in progress. */
class TableFrame {
  rows: string[][] = [];
  /** Where the open cell's text starts in the source, or -1 while no cell is open. */
  cellStart = -1;
  /** Cell text collected before a nested table interrupted it. */
  cellText = "";
  /** Column → the value a `rowspan` still owes the rows below. */
  private carried = new Map<number, { value: string; remaining: number }>();
  private row: string[] | null = null;
  private column = 0;
  private attributes = "";
  /** Rows a nested table handed over, emitted once the row holding it closes. */
  private pending: string[][] = [];

  /** Fills one column from a rowspan an earlier row opened. */
  private takeCarried(index: number): boolean {
    const carry = this.carried.get(index);
    if (!carry || !this.row) return false;
    this.row[index] = carry.value;
    carry.remaining -= 1;
    if (carry.remaining <= 0) this.carried.delete(index);
    return true;
  }

  private skipCarried(): void { while (this.takeCarried(this.column)) this.column += 1; }

  openCell(start: number, attributes: string): void {
    this.row ??= [];
    this.cellStart = start;
    this.attributes = attributes;
  }

  closeCell(source: string, end: number): void {
    if (this.cellStart < 0) return;
    const value = htmlCellText(this.cellText + source.slice(this.cellStart, end));
    this.cellStart = -1;
    this.cellText = "";
    this.row ??= [];
    this.skipCarried();
    const rowspan = readSpan(this.attributes, "rowspan");
    for (let span = readSpan(this.attributes, "colspan"); span > 0; span -= 1) {
      this.row[this.column] = value;
      if (rowspan > 1) this.carried.set(this.column, { value, remaining: rowspan - 1 });
      this.column += 1;
    }
  }

  openRow(): void { this.row ??= []; }

  closeRow(): void {
    if (this.row) {
      this.skipCarried();
      // A rowspan further right than this row's own cells still belongs to it.
      const trailing = [...this.carried.keys()].filter((key) => key > this.column).sort((left, right) => left - right);
      for (const index of trailing) this.takeCarried(index);
      this.rows.push(Array.from(this.row, (cell) => cell ?? ""));
      this.row = null;
      this.column = 0;
    }
    this.rows.push(...this.pending);
    this.pending.length = 0;
  }

  promote(rows: readonly string[][]): void { this.pending.push(...rows); }
}

/**
 * A nested table that is a grid in its own right is a roster wrapped in a layout table, so its
 * rows join the document right after the row holding it. Anything smaller is cell decoration and
 * folds into that cell's text instead of becoming rows nobody can map.
 */
function isGridTable(rows: readonly string[][]): boolean {
  return rows.length >= 2 && rows.some((row) => row.length >= 2);
}

/** Finishes the innermost table, and returns its rows only when it was a top-level one. */
function closeTable(frames: TableFrame[], source: string, start: number, end: number): string[][] | null {
  const frame = frames.pop()!;
  frame.closeCell(source, start);
  frame.closeRow();
  const parent = frames[frames.length - 1];
  if (!parent) return frame.rows;
  const insideCell = parent.cellStart >= 0;
  // The interrupted cell resumes after `</table>`, so its own text is never counted twice.
  if (insideCell) parent.cellStart = end;
  if (!insideCell || isGridTable(frame.rows)) parent.promote(frame.rows);
  else parent.cellText += ` ${frame.rows.flat().join(" ")} `;
  return null;
}

/**
 * Turns clipboard markup into the same row matrix a workbook produces, or null when the clipboard
 * carries no table at all. `colspan`/`rowspan` are filled across the block they cover, exactly
 * like a merged workbook cell.
 */
export function parseHtmlTableRows(html: string): string[][] | null {
  if (!/<table[\s>]/i.test(html)) return null;
  const source = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
  const frames: TableFrame[] = [];
  const rows: string[][] = [];

  for (const token of source.matchAll(TABLE_TOKEN)) {
    const start = token.index ?? 0;
    const end = start + token[0].length;
    const closing = token[1] === "/";
    const tag = token[2]!.toLowerCase();
    const frame = frames[frames.length - 1];
    if (tag === "table") {
      if (!closing) {
        // The text before a nested table is a word of its own, whatever becomes of the table.
        if (frame && frame.cellStart >= 0) frame.cellText += `${source.slice(frame.cellStart, start)} `;
        frames.push(new TableFrame());
      } else if (frame) {
        rows.push(...(closeTable(frames, source, start, end) ?? []));
      }
      continue;
    }
    // A stray cell or row outside every table belongs to no matrix at all.
    if (!frame) continue;
    frame.closeCell(source, start);
    if (tag === "td" || tag === "th") {
      if (!closing) frame.openCell(end, token[3] ?? "");
      continue;
    }
    frame.closeRow();
    if (tag === "tr" && !closing) frame.openRow();
  }
  // Markup that never closes its tables still yields the rows it did open.
  while (frames.length > 0) rows.push(...(closeTable(frames, source, source.length, source.length) ?? []));

  return rows.length > 0 ? rows : null;
}
