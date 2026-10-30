"use client";
import { useState } from "react";
import type { DemoQuestion } from "@/lib/demo/model";
import { questionTypes as TYPES } from "@/lib/demo/shared";
const input = "form-input";
export function QuestionForm({
  question,
  onSave,
}: {
  question: DemoQuestion;
  onSave: (question: DemoQuestion) => void;
}) {
  const [type, setType] = useState(question.type);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const options =
          type === "true_false"
            ? ["True", "False"]
            : String(data.get("options") ?? "")
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
        const answer = String(data.get("answer")).trim();
        if (
          (type === "multiple_choice" || type === "true_false") &&
          (options.length < 2 || !options.includes(answer))
        ) {
          setError("The correct answer must exactly match one of the options.");
          return;
        }
        onSave({
          ...question,
          type,
          prompt: String(data.get("prompt")).trim(),
          options,
          answer,
        });
      }}
    >
      <label className="form-field">
        <span>Type</span>
        <select
          className={input}
          value={type}
          onChange={(e) => setType(e.target.value as DemoQuestion["type"])}
        >
          {Object.entries(TYPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>Question</span>
        <textarea
          name="prompt"
          required
          maxLength={1000}
          className={input}
          defaultValue={question.prompt}
        />
      </label>
      {type === "multiple_choice" && (
        <label className="form-field">
          <span>Options (one per line)</span>
          <textarea
            name="options"
            required
            className={input}
            defaultValue={question.options.join("\n")}
          />
        </label>
      )}
      <label className="form-field">
        <span>
          {type === "enumeration"
            ? "Expected answers (one per line, any order)"
            : "Correct answer"}
        </span>
        {type === "true_false" ? (
          <select
            name="answer"
            className={input}
            defaultValue={question.answer === "False" ? "False" : "True"}
          >
            <option>True</option>
            <option>False</option>
          </select>
        ) : (
          <textarea
            key={type}
            name="answer"
            required
            maxLength={2000}
            className={input}
            defaultValue={question.answer}
          />
        )}
      </label>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <button className="btn btn-primary">Save question</button>
    </form>
  );
}
