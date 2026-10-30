import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export const guestCookie = "quiz_demo_guest";
export const lifetime = 24 * 60 * 60;
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export function demoDb() {
  const url = process.env.DEMO_SUPABASE_URL;
  const key = process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Demo storage is not configured. Follow DEMO_DEPLOYMENT.md.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function guest() {
  const token = (await cookies()).get(guestCookie)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data, error } = await demoDb()
    .from("demo_guests")
    .select("id,name,expires_at")
    .eq("token_hash", tokenHash(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error)
    throw new Error(
      "Demo storage is unavailable. Check the demo database migration.",
    );
  return data;
}
export async function purgeExpired() {
  const { error } = await demoDb()
    .from("demo_guests")
    .delete()
    .lte("expires_at", new Date().toISOString());
  if (error)
    throw new Error(
      "Demo storage is unavailable. Check the demo database migration.",
    );
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
export async function readBody(request: Request) {
  // Stream limit also protects requests without a Content-Length header.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 100_000) {
      await reader.cancel();
      throw new Error("Request is too large.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function failure(error: unknown) {
  console.error(
    "Demo request failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    {
      message:
        "Could not complete this request. Check the demo setup or try again.",
    },
    { status: 503 },
  );
}
