import { randomBytes } from "node:crypto";

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MAX_TIMESTAMP = 0xffffffffffff;

/** ERD의 접두어 + ULID 26자. 같은 밀리초 내 정렬은 보장하지 않는다. */
export function createAuthRecordId(
  prefix: "usr" | "ses",
  timestamp = Date.now(),
  entropy: Uint8Array = randomBytes(10),
): string {
  if ((prefix !== "usr" && prefix !== "ses") || !Number.isSafeInteger(timestamp) ||
      timestamp < 0 || timestamp > MAX_TIMESTAMP || !(entropy instanceof Uint8Array) || entropy.length !== 10) {
    throw new Error("Invalid auth record ID source");
  }
  let encoded = BigInt(timestamp);
  for (const byte of entropy) encoded = (encoded << 8n) | BigInt(byte);
  let ulid = "";
  for (let index = 0; index < 26; index += 1) {
    ulid = CROCKFORD_BASE32[Number(encoded & 31n)] + ulid;
    encoded >>= 5n;
  }
  return `${prefix}_${ulid}`;
}
