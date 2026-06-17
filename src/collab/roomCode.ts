// Share codes are the room identity. We use Crockford base32 (digits + A–Z minus
// the ambiguous I, L, O, U) so a code is easy to read aloud and type. 8 chars =
// 32^8 ≈ 1.1e12 possibilities — enough entropy that codes can't be guessed in
// practice, while staying short like a ToDesk code.
//
// Keep CODE_RE in sync with the server (server/index.mjs).

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // no I, L, O, U
export const CODE_LENGTH = 8;
export const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

export function generateRoomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Uppercase and strip spaces/dashes, then validate the canonical shape. */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidRoomCode(input: string): boolean {
  return CODE_RE.test(normalizeRoomCode(input));
}

/** Human-friendly grouping for display, e.g. "ABCD-1234". */
export function formatRoomCode(code: string): string {
  const c = normalizeRoomCode(code);
  return c.length === CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}
