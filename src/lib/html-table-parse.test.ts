import { describe, expect, it } from "vitest";
import { parseHtmlTable, rowsToTabText } from "./binary-import";
import { parseHtmlTableRows } from "./html-table-parse";

describe("pasted html tables", () => {
  it("reads a table copied out of a browser, markup and entities included", () => {
    const result = parseHtmlTable(`
      <meta charset="utf-8"><style>td { color: red }</style>
      <table border="0"><colgroup><col width="80"></colgroup><tbody>
        <tr><th>学生姓名</th><th>录取院校</th><th>城市</th><th>备注</th></tr>
        <tr><td><span style="font-weight:700">苏&nbsp;禾</span></td><td>浙江大学</td><td>杭州市</td><td>保研</td></tr>
        <tr><td>林舟</td><td><a href="#">北京大学</a></td><td>北京<br>市</td><td></td></tr>
      </tbody></table>
    `);

    expect(result.headerRowIndex).toBe(0);
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏 禾", university: "浙江大学", city: "杭州市" }),
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京 市" }),
    ]);
    expect(result.unmappedHeaders).toEqual(["备注"]);
    expect(result.unparsed).toEqual([]);
  });

  it("fills a rowspan and colspan block the way a merged workbook cell is filled", () => {
    const rows = parseHtmlTableRows(`
      <table>
        <tr><td>学生姓名</td><td>录取院校</td><td>城市</td><td>省份</td></tr>
        <tr><td>苏禾</td><td>浙江大学</td><td>杭州市</td><td rowspan="2">浙江省</td></tr>
        <tr><td>陈宁</td><td>宁波大学</td><td>宁波市</td></tr>
        <tr><td colspan="2">合计</td><td>2 人</td><td></td></tr>
      </table>
    `);

    expect(rows).toEqual([
      ["学生姓名", "录取院校", "城市", "省份"],
      ["苏禾", "浙江大学", "杭州市", "浙江省"],
      ["陈宁", "宁波大学", "宁波市", "浙江省"],
      ["合计", "合计", "2 人", ""],
    ]);
    const parsed = parseHtmlTable(
      `<table>${rows!.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</table>`,
    );
    expect(parsed.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", province: "浙江省" }),
      expect.objectContaining({ name: "陈宁", province: "浙江省" }),
    ]);
    // The totals line the colspan filled out is named, not imported.
    expect(parsed.unparsed).toEqual([{ sourceLine: 4, rawLine: "合计\t合计\t2 人", reason: "汇总行" }]);
  });

  it("carries a rowspan over a row that stops short of it", () => {
    expect(parseHtmlTableRows(
      '<table><tr><td rowspan="3">浙江省</td><td>苏禾</td><td>浙江大学</td></tr>'
      + "<tr><td>陈宁</td></tr><tr><td>顾言</td><td>宁波大学</td></tr></table>",
    )).toEqual([
      ["浙江省", "苏禾", "浙江大学"],
      ["浙江省", "陈宁"],
      ["浙江省", "顾言", "宁波大学"],
    ]);
  });

  it("reads a table whose closing cell and row tags the author left out", () => {
    // A browser repairs this markup before showing it, so a table copied off a
    // hand-written page reaches the clipboard looking exactly like this.
    const result = parseHtmlTable(
      "<table><tr><th>姓名<th>院校<th>城市<tr><td>林舟<td>北京大学<td>北京市"
      + "<tr><td>苏禾<td>浙江大学<td>杭州市</table>",
    );

    expect(result.headerRowIndex).toBe(0);
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("keeps a cell whose own attribute value contains an angle bracket", () => {
    // An online spreadsheet ships the cell value back as JSON in an attribute,
    // so scanning the start tag to the first ">" would leak markup into the cell.
    expect(parseHtmlTableRows(
      '<table><tr><td data-sheets-value=\'{"2":"姓名"}\'>姓名</td><td>去向</td><td>城市</td></tr>'
      + '<tr><td>林舟</td><td data-sheets-value=\'{"2":"本科>硕士"}\'>本科&gt;硕士</td><td>北京市</td></tr></table>',
    )).toEqual([
      ["姓名", "去向", "城市"],
      ["林舟", "本科>硕士", "北京市"],
    ]);
  });

  it("keeps empty cells so a sparse table stays aligned", () => {
    const result = parseHtmlTable(`
      <table>
        <tr><td>学号</td><td>姓名</td><td>院校</td><td>城市</td><td>省份</td></tr>
        <tr><td></td><td>林舟</td><td>北京大学</td><td>北京市</td><td></td></tr>
      </table>
    `);

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
    ]);
    expect(result.candidates[0]).not.toHaveProperty("province");
  });

  it("finds the header below a caption row and keeps the province off overseas rows", () => {
    const result = parseHtmlTable(`
      <table>
        <tr><td colspan="5">2026 届毕业去向</td></tr>
        <tr><th>姓名</th><th>院校</th><th>城市</th><th>省份</th><th>去向类型</th></tr>
        <tr><td>周晴</td><td>哈佛大学</td><td>美国·波士顿</td><td>马萨诸塞州</td><td>海外</td></tr>
        <tr><td>苏禾</td><td>浙江大学</td><td>杭州市</td><td>浙江省</td><td>中国去向</td></tr>
      </table>
    `);

    expect(result.headerRowIndex).toBe(1);
    expect(result.candidates[0]).toEqual(expect.objectContaining({ name: "周晴", locationScope: "international" }));
    expect(result.candidates[0]).not.toHaveProperty("province");
    expect(result.candidates[1]).toEqual(expect.objectContaining({ name: "苏禾", province: "浙江省" }));
    expect(result.candidates[1]).not.toHaveProperty("locationScope");
  });

  it("keeps the whole outer row when a cell holds a nested table", () => {
    // A Word/WPS export wraps a multi-line cell in a <table> of its own.
    // Reading the outer row up to the next <tr> cut it off at that cell and
    // dropped every later column without reporting anything.
    expect(parseHtmlTableRows(
      "<table><tr><th>姓名</th><th>院校</th><th>城市</th><th>备注</th></tr>"
      + "<tr><td>林舟</td><td>北京大学</td><td>北京市</td>"
      + "<td><table><tr><td>2026 秋</td></tr></table></td></tr>"
      + "<tr><td><table><tr><td>甲班</td></tr></table>苏禾</td><td>浙江大学</td><td>杭州市</td><td></td></tr>"
      + "</table>",
    )).toEqual([
      ["姓名", "院校", "城市", "备注"],
      ["林舟", "北京大学", "北京市", "2026 秋"],
      ["甲班 苏禾", "浙江大学", "杭州市", ""],
    ]);
  });

  it("imports every row of a roster wrapped in a layout table", () => {
    // Old school pages put the roster inside a full-width layout table.
    const result = parseHtmlTable(
      '<table width="100%"><tr><td class="content">'
      + "<table><tr><th>姓名</th><th>院校</th><th>城市</th></tr>"
      + "<tr><td>林舟</td><td>北京大学</td><td>北京市</td></tr>"
      + "<tr><td>苏禾</td><td>浙江大学</td><td>杭州市</td></tr></table>"
      + "</td></tr></table>",
    );

    expect(result.headerRowIndex).toBe(1);
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["林舟", "苏禾"]);
    expect(result.unparsed).toEqual([]);
  });

  it("reports the rows of a nested grid instead of hiding them in one cell", () => {
    // A nested table that is a grid of its own cannot be told apart from a roster in a layout
    // wrapper, so its rows are kept as rows: a noisy 未识别 line is recoverable, a roster folded
    // into a single cell is not. The row holding it is complete either way.
    const result = parseHtmlTable(
      "<table><tr><td>姓名</td><td>院校</td><td>城市</td><td>备注</td></tr>"
      + "<tr><td>林舟</td><td>北京大学</td><td>北京市</td>"
      + "<td><table><tr><td>面试</td><td>10-01</td></tr><tr><td>入学</td><td>09-01</td></tr></table></td></tr></table>",
    );

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
    ]);
    expect(result.unparsed).toEqual([
      { sourceLine: 3, rawLine: "面试\t10-01", reason: "缺少城市" },
      { sourceLine: 4, rawLine: "入学\t09-01", reason: "缺少城市" },
    ]);
  });

  it("keeps a nested table from swallowing the rows that follow it", () => {
    const rows = parseHtmlTableRows(
      "<table><tr><td>姓名</td><td>院校</td><td>城市</td></tr>"
      + "<tr><td>林舟</td><td><table><tr><td>北京大学</td></tr></table></td><td>北京市</td></tr>"
      + "<tr><td>苏禾</td><td>浙江大学</td><td>杭州市</td></tr></table>",
    );

    expect(rows).toEqual([
      ["姓名", "院校", "城市"],
      ["林舟", "北京大学", "北京市"],
      ["苏禾", "浙江大学", "杭州市"],
    ]);
  });

  it("keeps both tables when a page ships two rosters side by side", () => {
    const result = parseHtmlTable(
      "<table><tr><th>姓名</th><th>院校</th><th>城市</th></tr>"
      + "<tr><td>林舟</td><td>北京大学</td><td>北京市</td></tr></table>"
      + "<h3>研究生</h3>"
      + "<table><tr><th>姓名</th><th>院校</th><th>城市</th></tr>"
      + "<tr><td>苏禾</td><td>浙江大学</td><td>杭州市</td></tr></table>",
    );

    // The repeated header of the second table is a header, not a student called 姓名.
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["林舟", "苏禾"]);
    expect(result.unparsed).toEqual([]);
  });

  it("reports no table for clipboard markup that carries none", () => {
    expect(parseHtmlTableRows("<div><p>林舟 北京大学 北京</p></div>")).toBeNull();
    expect(parseHtmlTableRows("<table></table>")).toBeNull();
    expect(parseHtmlTable("<p>林舟</p>")).toEqual({
      candidates: [],
      unparsed: [],
      columnMappings: [],
      unmappedHeaders: [],
      missingRequiredFields: [],
    });
  });

  it("renders recognized rows as tab-separated text without dropping empty cells", () => {
    expect(rowsToTabText([
      ["学号", "姓名", "院校", "城市"],
      ["", "林舟", "北京大学", "北京市"],
      ["", "", "", ""],
    ])).toBe("学号\t姓名\t院校\t城市\n\t林舟\t北京大学\t北京市");
  });
});
