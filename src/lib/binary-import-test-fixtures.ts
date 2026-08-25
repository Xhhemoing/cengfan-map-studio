/**
 * GB18030 双字节编码表：把所有合法双字节对用换行隔开一次性解码，
 * 每个分段长度为 1 才是真正映射到单个字符的字节对（未映射的会解出替换字符加回读的 ASCII 尾字节）。
 */
function buildGb18030Table(): Map<string, [number, number]> {
  const pairs: Array<[number, number]> = [];
  const bytes: number[] = [];
  for (let lead = 0x81; lead <= 0xfe; lead += 1) {
    for (let trail = 0x40; trail <= 0xfe; trail += 1) {
      if (trail === 0x7f) continue;
      pairs.push([lead, trail]);
      bytes.push(lead, trail, 0x0a);
    }
  }
  const segments = new TextDecoder("gb18030").decode(new Uint8Array(bytes)).split("\n");
  const table = new Map<string, [number, number]>();
  segments.forEach((segment, index) => {
    const pair = pairs[index];
    if (!pair || segment.length !== 1 || table.has(segment)) return;
    table.set(segment, pair);
  });
  return table;
}

const gb18030Table = buildGb18030Table();

export function encodeGb18030(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    const pair = gb18030Table.get(character);
    if (!pair) throw new Error(`GB18030 编码表缺少字符：${character}`);
    bytes.push(pair[0], pair[1]);
  }
  return new Uint8Array(bytes);
}
