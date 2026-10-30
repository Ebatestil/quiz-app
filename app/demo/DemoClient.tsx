"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DemoQuestion } from "@/lib/demo/model";
import type { GuestWorkspace } from "@/lib/demo/shared";
import { questionTypes, validateQuiz } from "@/lib/demo/shared";
import { demoRequest } from "@/lib/demo/request";
import { QuestionForm } from "./QuestionForm";
import "./demo.css";

export function DemoClient() {
  const [workspace, setWorkspace] = useState<GuestWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<DemoQuestion[]>([]);
  const [question, setQuestion] = useState<DemoQuestion | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [ending, setEnding] = useState(false);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const response = await fetch("/api/demo/workspace", { cache: "no-store" });
    const data = await response.json();
    if (sequence !== refreshSequence.current) return;
    if (response.status === 401) {
      setWorkspace(null);
      setEditing(false);
      setQuestions([]);
      setQuestion(null);
      setTitle("");
      return;
    }
    if (!response.ok)
      throw new Error(data.message || "Unable to load your workspace.");
    setWorkspace(data);
  }, []);
  useEffect(() => {
    let active = true;
    const update = () =>
      refresh()
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    void update();
    const onFocus = () => {
      void update();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered =
    workspace?.results.filter((r) =>
      r.name.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  return (
    <div className="demo-app">
      <header className="demo-header">
        <a className="demo-brand" href="/demo">
          Quiz App<span>.</span>
          <small>Make it. Share it. See what clicks.</small>
        </a>
        {workspace && (
          <div className="demo-header-actions">
            <span className="demo-guest">Hi, {workspace.name}</span>
            <button className="btn" onClick={() => setEnding(true)}>
              End demo
            </button>
          </div>
        )}
      </header>
      <main className="shared-main">
        {error && (
          <p className="shared-alert" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="shared-notice" role="status">
            {message}
          </p>
        )}
        {loading ? (
          <p role="status">Loading your workspace…</p>
        ) : !workspace ? (
          <section className="shared-welcome">
            <div>
              <span className="eyebrow">
                A little quiz. A complete experience.
              </span>
              <h1>Your next quiz starts here.</h1>
              <p>
                Write a few questions, send the link, and watch the answers come
                in. Try the whole flow in your own temporary workspace.
              </p>
              <ol>
                <li>Enter your name</li>
                <li>Create and share a quiz</li>
                <li>Answer it and check the results</li>
              </ol>
            </div>
            <form
              className="surface space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const name = String(new FormData(e.currentTarget).get("name"));
                void run(async () => {
                  await demoRequest("register", {
                    method: "POST",
                    body: JSON.stringify({ name }),
                  });
                  await refresh();
                });
              }}
            >
              <h2>Make yourself at home.</h2>
              <label className="form-field">
                <span>Your name</span>
                <input
                  name="name"
                  className="form-input"
                  required
                  maxLength={80}
                  autoComplete="off"
                  placeholder="What should we call you?"
                />
              </label>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? "Starting…" : "Start my demo"}
              </button>
              <p className="demo-small">
                No password or email. Use a nickname. Your workspace and links
                expire after 24 hours. Return using this browser to see your
                results.
              </p>
            </form>
          </section>
        ) : editing ? (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">Create a quiz</span>
                <h1>What would you like to ask?</h1>
                <p>
                  Add up to 30 questions. Saving creates a link you can open on
                  any device.
                </p>
              </div>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setQuestion(null);
                }}
              >
                Back to workspace
              </button>
            </div>
            <div className="demo-editor-grid">
              <section className="surface space-y-4">
                <label className="form-field">
                  <span>Quiz title</span>
                  <input
                    className="form-input"
                    maxLength={160}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="A quick science quiz"
                  />
                </label>
                {questions.map((q, i) => (
                  <article className="demo-question-row" key={q.id}>
                    <span className="eyebrow">
                      {i + 1} · {questionTypes[q.type]}
                    </span>
                    <h3>{q.prompt}</h3>
                    <div className="demo-actions">
                      <button className="btn" onClick={() => setQuestion(q)}>
                        Edit
                      </button>
                      <button
                        className="btn"
                        onClick={() =>
                          setQuestions(
                            questions.filter((item) => item.id !== q.id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
                <div className="demo-actions">
                  <button
                    className="btn"
                    disabled={questions.length >= 30}
                    onClick={() =>
                      setQuestion({
                        id: Math.max(0, ...questions.map((q) => q.id)) + 1,
                        type: "multiple_choice",
                        prompt: "",
                        options: ["Option A", "Option B"],
                        answer: "Option A",
                      })
                    }
                  >
                    + Add question
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={busy || !!question}
                    onClick={() =>
                      void run(async () => {
                        const draft = validateQuiz({ title, questions });
                        await demoRequest("quizzes", {
                          method: "POST",
                          body: JSON.stringify(draft),
                        });
                        await refresh();
                        setEditing(false);
                        setTitle("");
                        setQuestions([]);
                        setMessage("Quiz saved. Your link is ready to share.");
                      })
                    }
                  >
                    {busy ? "Saving…" : "Save & generate link"}
                  </button>
                </div>
                <p className="demo-small">
                  Save the question before saving your quiz. Published quizzes
                  stay fixed so every result uses the same answer key.
                </p>
              </section>
              <section className="surface">
                {question ? (
                  <>
                    <div className="demo-section-heading">
                      <h2>Question editor</h2>
                      <button className="btn" onClick={() => setQuestion(null)}>
                        Cancel
                      </button>
                    </div>
                    <QuestionForm
                      key={question.id}
                      question={question}
                      onSave={(q) => {
                        setQuestions((previous) =>
                          [
                            ...previous.filter((item) => item.id !== q.id),
                            q,
                          ].sort((a, b) => a.id - b.id),
                        );
                        setQuestion(null);
                      }}
                    />
                  </>
                ) : (
                  <>
                    <h2>Four ways to ask</h2>
                    <p className="demo-small">
                      Choose multiple choice, true or false, identification, or
                      enumeration. Each question is worth one point.
                    </p>
                    <p className="demo-small">
                      For enumeration, all listed answers must match, in any
                      order.
                    </p>
                  </>
                )}
              </section>
            </div>
          </>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">Your workspace</span>
                <h1>Make something worth answering.</h1>
                <p>
                  Available until{" "}
                  {new Date(workspace.expires_at).toLocaleString()}. Keep this
                  browser to return to your results.
                </p>
              </div>
              <button
                className="btn btn-primary"
                disabled={workspace.quizzes.length >= 10}
                onClick={() => {
                  setEditing(true);
                  setTitle("");
                  setQuestions([]);
                  setQuestion(null);
                }}
              >
                + Create quiz
              </button>
            </div>
            <section className="shared-quizzes">
              {workspace.quizzes.length === 0 ? (
                <div className="surface shared-empty">
                  <h2>A clean slate.</h2>
                  <p>
                    Your quizzes will appear here. Create your first one to get
                    a shareable link.
                  </p>
                </div>
              ) : (
                workspace.quizzes.map((quiz) => (
                  <article className="surface" key={quiz.id}>
                    <span className="eyebrow">
                      {quiz.questions.length} questions ·{" "}
                      {
                        workspace.results.filter((r) => r.quiz_id === quiz.id)
                          .length
                      }{" "}
                      submissions
                    </span>
                    <h2>{quiz.title}</h2>
                    <div className="demo-actions">
                      <a
                        className="btn btn-primary"
                        href={`/q/${quiz.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open quiz ↗
                      </a>
                      <button
                        className="btn"
                        onClick={() =>
                          void run(async () => {
                            await navigator.clipboard.writeText(
                              `${window.location.origin}/q/${quiz.id}`,
                            );
                            setMessage("Quiz link copied.");
                          })
                        }
                      >
                        Copy link
                      </button>
                    </div>
                    <label className="form-field">
                      <span>Quiz link</span>
                      <input
                        className="form-input"
                        readOnly
                        value={
                          typeof window === "undefined"
                            ? `/q/${quiz.id}`
                            : `${window.location.origin}/q/${quiz.id}`
                        }
                        onFocus={(e) => e.target.select()}
                      />
                    </label>
                  </article>
                ))
              )}
            </section>
            <section className="surface shared-results">
              <div className="demo-section-heading">
                <div>
                  <h2>Results</h2>
                  <p className="demo-small">
                    Open a quiz, submit your answers, then return here.
                  </p>
                </div>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await refresh();
                      setMessage("Results refreshed.");
                    })
                  }
                >
                  Refresh results
                </button>
              </div>
              <label className="form-field">
                <span>Search participant</span>
                <input
                  className="form-input"
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <div className="shared-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Quiz</th>
                      <th>Score</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .slice((currentPage - 1) * 10, currentPage * 10)
                      .map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>
                            {
                              workspace.quizzes.find((q) => q.id === r.quiz_id)
                                ?.title
                            }
                          </td>
                          <td>
                            {r.score} / {r.total}
                          </td>
                          <td>{new Date(r.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    {!filtered.length && (
                      <tr>
                        <td colSpan={4}>No results yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="demo-actions">
                <button
                  className="btn"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {currentPage} of {pages}
                </span>
                <button
                  className="btn"
                  disabled={currentPage === pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            </section>
          </>
        )}
        {ending && (
          <section
            className="surface shared-confirm"
            role="region"
            aria-label="End demo confirmation"
          >
            <h2>End this demo?</h2>
            <p>
              This deletes your quizzes and results, and their links will stop
              working.
            </p>
            <div className="demo-actions">
              <button
                className="btn"
                disabled={busy}
                onClick={() => setEnding(false)}
              >
                Keep exploring
              </button>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await demoRequest("workspace", { method: "DELETE" });
                    ++refreshSequence.current;
                    setWorkspace(null);
                    setEnding(false);
                    setEditing(false);
                    setTitle("");
                    setQuestions([]);
                    setQuestion(null);
                    setMessage("Your demo data has been cleared.");
                  })
                }
              >
                Delete my demo data
              </button>
            </div>
          </section>
        )}
      </main>
      <footer className="shared-footer">
        Quiz App · A hands-on demo · Temporary data, real quiz links
      </footer>
    </div>
  );
}
