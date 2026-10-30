import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import {
  demoDb,
  guest,
  guestCookie,
  lifetime,
  newToken,
  tokenHash,
  purgeExpired,
  sameOrigin,
  readBody,
  failure,
} from "@/lib/demo/backend";
import { publicQuiz, validateQuiz } from "@/lib/demo/shared";
import type { SharedQuiz } from "@/lib/demo/shared";
import { isCorrect } from "@/lib/demo/model";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const uuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
async function liveQuiz(id: string) {
  if (!uuid(id)) return null;
  const { data, error } = await demoDb()
    .from("demo_quizzes")
    .select("id,title,questions,created_at,demo_guests!inner(expires_at)")
    .eq("id", id)
    .gt("demo_guests.expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data as SharedQuiz | null;
}
export async function GET(_request: Request, context: Context) {
  try {
    const { path } = await context.params;
    if (path.length === 2 && path[0] === "quiz") {
      const quiz = await liveQuiz(path[1]);
      return quiz
        ? json(publicQuiz(quiz))
        : json({ message: "This quiz has expired or is unavailable." }, 404);
    }
    if (path.join("/") !== "workspace") return json({}, 404);
    const owner = await guest();
    if (!owner)
      return json({ message: "Enter your name to start a new demo." }, 401);
    await purgeExpired();
    const db = demoDb();
    const { data: quizzes, error } = await db
      .from("demo_quizzes")
      .select("id,title,questions,created_at")
      .eq("guest_id", owner.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const ids = (quizzes ?? []).map((q) => q.id);
    const results = ids.length
      ? await db
          .from("demo_results")
          .select("id,quiz_id,name,score,total,created_at")
          .in("quiz_id", ids)
          .order("created_at", { ascending: false })
          .limit(1000)
      : { data: [], error: null };
    if (results.error) throw results.error;
    return json({
      name: owner.name,
      expires_at: owner.expires_at,
      quizzes,
      results: results.data,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request))
    return json({ message: "Invalid request origin." }, 403);
  let body;
  try {
    body = await readBody(request);
  } catch {
    return json({ message: "Invalid or oversized request." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return json({ message: "Invalid request." }, 400);
  try {
    const { path } = await context.params;
    const action = path.join("/");
    const db = demoDb();
    if (action === "register") {
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 80
      )
        return json({ message: "Enter a name of up to 80 characters." }, 422);
      const existing = await guest();
      if (existing) return json({ ok: true });
      await purgeExpired();
      const token = newToken();
      const ip =
        request.headers.get("x-vercel-forwarded-for") ??
        request.headers.get("x-forwarded-for")?.split(",")[0] ??
        "local";
      const rateKey = createHmac(
        "sha256",
        process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY!,
      )
        .update(ip)
        .digest("hex");
      const { error } = await db
        .from("demo_guests")
        .insert({
          name: body.name.trim(),
          token_hash: tokenHash(token),
          rate_key: rateKey,
        });
      if (error?.code === "P0001")
        return json(
          { message: "Demo signup limit reached. Please try again later." },
          429,
        );
      if (error) throw error;
      (await cookies()).set(guestCookie, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: lifetime,
      });
      return json({ ok: true }, 201);
    }
    if (action === "quizzes") {
      const owner = await guest();
      if (!owner)
        return json(
          { message: "Your session expired. Refresh to register again." },
          401,
        );
      let quiz;
      try {
        quiz = validateQuiz(body);
      } catch (error) {
        return json({ message: (error as Error).message }, 422);
      }
      const { data, error } = await db
        .from("demo_quizzes")
        .insert({ ...quiz, guest_id: owner.id })
        .select("id")
        .single();
      if (error?.code === "P0001")
        return json(
          { message: "You can create up to 10 quizzes in this demo." },
          422,
        );
      if (error) throw error;
      return json(data, 201);
    }
    if (path.length === 3 && path[0] === "quiz" && path[2] === "submit") {
      const quiz = await liveQuiz(path[1]);
      if (!quiz)
        return json(
          { message: "This quiz has expired or is unavailable." },
          404,
        );
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 80 ||
        typeof body.submissionId !== "string" ||
        !uuid(body.submissionId) ||
        !Array.isArray(body.answers) ||
        body.answers.length !== quiz.questions.length ||
        body.answers.some(
          (a: unknown) => typeof a !== "string" || a.length > 2000,
        )
      )
        return json({ message: "Enter your name and valid answers." }, 422);
      const score = quiz.questions.reduce(
        (sum, q, i) => sum + Number(isCorrect(q, body.answers[i])),
        0,
      );
      const { data, error } = await db
        .from("demo_results")
        .insert({
          quiz_id: quiz.id,
          submission_id: body.submissionId,
          name: body.name.trim(),
          answers: body.answers,
          score,
          total: quiz.questions.length,
        })
        .select("score,total")
        .single();
      if (error?.code === "23505") {
        const previous = await db
          .from("demo_results")
          .select("score,total")
          .eq("quiz_id", quiz.id)
          .eq("submission_id", body.submissionId)
          .single();
        if (previous.error) throw previous.error;
        return json(previous.data);
      }
      if (error?.code === "P0001")
        return json(
          {
            message:
              "This quiz is expired or has reached its 100-submission demo limit.",
          },
          422,
        );
      if (error) throw error;
      return json(data, 201);
    }
    return json({}, 404);
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  if (!sameOrigin(request)) return json({}, 403);
  if ((await context.params).path.join("/") !== "workspace")
    return json({}, 404);
  try {
    const owner = await guest();
    if (owner) {
      const { error } = await demoDb()
        .from("demo_guests")
        .delete()
        .eq("id", owner.id);
      if (error) throw error;
    }
    (await cookies()).delete(guestCookie);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
