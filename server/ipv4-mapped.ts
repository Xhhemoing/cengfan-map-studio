const bracketedAddress = /^\[([^\]]+)\](?::\d+)?$/;

function unwrapBracketedAddress(value: string): string {
  return value.match(bracketedAddress)?.[1] ?? value;
}

export function normalizeIpv4MappedAddress(value: string): string {
  const mappedMatch = unwrapBracketedAddress(value).match(/^::ffff:(.*)$/i);
  if (!mappedMatch) return value;

  const mappedAddress = mappedMatch[1];
  const hexGroups = mappedAddress.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hexGroups) return mappedAddress;

  const high = Number.parseInt(hexGroups[1], 16);
  const low = Number.parseInt(hexGroups[2], 16);
  return [
    (high >> 8) & 255,
    high & 255,
    (low >> 8) & 255,
    low & 255,
  ].join(".");
}
