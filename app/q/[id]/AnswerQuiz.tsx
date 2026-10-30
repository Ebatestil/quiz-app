"use client";
import { useEffect, useState } from "react";
import type { publicQuiz } from "@/lib/demo/shared";
import { demoRequest } from "@/lib/demo/request";
import "@/app/demo/demo.css";
export function AnswerQuiz({ id }: { id: string }) {
  const [quiz, setQuiz] = useState<ReturnType<typeof publicQuiz> | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [submissionId, setSubmissionId] = useState("");
  const [result, setResult] = useState<{ score: number; total: number } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    demoRequest(`quiz/${id}`)
      .then((data) => {
        if (active) {
          setQuiz(data);
          setAnswers(data.questions.map(() => ""));
          setSubmissionId(crypto.randomUUID());
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <div className="demo-app">
      <header className="demo-header">
        <a className="demo-brand" href="/demo">
          Quiz App<span>.</span>
          <small>A shared quiz</small>
        </a>
        <a className="btn" href="/demo">
          My workspace
        </a>
      </header>
      <main className="shared-answer">
        {error && (
          <p role="alert" className="shared-alert">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Loading quiz…</p>
        ) : result ? (
          <section className="surface shared-empty">
            <span className="eyebrow">Answers submitted</span>
            <h1>
              {result.score} / {result.total}
            </h1>
            <p>
              Your result has been saved. The quiz creator can now see it in
              their workspace.
            </p>
            <a className="btn btn-primary" href="/demo">
              Return to workspace
            </a>
          </section>
        ) : (
          quiz && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                const name = String(new FormData(e.currentTarget).get("name"));
                setBusy(true);
                setError("");
                try {
                  const data = await demoRequest(`quiz/${id}/submit`, {
                    method: "POST",
                    body: JSON.stringify({ name, answers, submissionId }),
                  });
                  setResult(data);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <span className="eyebrow">
                {quiz.questions.length} questions · One point each
              </span>
              <h1>{quiz.title}</h1>
              <p className="demo-small">
                Enter a nickname and answer below. Your name and score will be
                visible to the quiz creator. This link expires with their
                24-hour demo session.
              </p>
              <label className="form-field surface">
                <span>Your name</span>
                <input
                  className="form-input"
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="off"
                />
              </label>
              {quiz.questions.map((q, i) => (
                <fieldset key={q.id} className="surface shared-answer-question">
                  <legend>
                    {i + 1}. {q.prompt}
                  </legend>
                  {q.type === "multiple_choice" || q.type === "true_false" ? (
                    q.options.map((option) => (
                      <label className="shared-option" key={option}>
                        <input
                          type="radio"
                          name={`question-${q.id}`}
                          value={option}
                          checked={answers[i] === option}
                          onChange={() =>
                            setAnswers((previous) =>
                              previous.map((v, j) => (j === i ? option : v)),
                            )
                          }
                        />
                        {option}
                      </label>
                    ))
                  ) : (
                    <label className="form-field">
                      <span>
                        {q.type === "enumeration"
                          ? "List answers, one per line. Order does not matter."
                          : "Your answer"}
                      </span>
                      <textarea
                        className="form-input"
                        maxLength={2000}
                        value={answers[i]}
                        onChange={(e) =>
                          setAnswers((previous) =>
                            previous.map((v, j) =>
                              j === i ? e.target.value : v,
                            ),
                          )
                        }
                      />
                    </label>
                  )}
                </fieldset>
              ))}
              <button className="btn btn-primary" disabled={busy}>
                {busy ? "Submitting…" : "Submit answers"}
              </button>
              <p className="demo-small">
                Unanswered questions receive zero points.
              </p>
            </form>
          )
        )}
      </main>
    </div>
  );
}
