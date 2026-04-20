// Anonymous per-browser token used for client favorites on public galleries.
const KEY = "lumen.client_token";

export function getClientToken(): string {
  let t = localStorage.getItem(KEY);
  if (!t) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    t = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(KEY, t);
  }
  return t;
}
