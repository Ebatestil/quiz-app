import type { DemoQuestion } from "./model";

export type SharedQuiz = {
  id: string;
  title: string;
  questions: DemoQuestion[];
  created_at: string;
};
export type SharedResult = {
  id: string;
  quiz_id: string;
  name: string;
  score: number;
  total: number;
  created_at: string;
};
export type GuestWorkspace = {
  name: string;
  expires_at: string;
  quizzes: SharedQuiz[];
  results: SharedResult[];
};
export const questionTypes = {
  multiple_choice: "Multiple choice",
  true_false: "True / false",
  identification: "Identification",
  enumeration: "Enumeration",
};

export function validateQuiz(value: unknown): {
  title: string;
  questions: DemoQuestion[];
} {
  if (!value || typeof value !== "object")
    throw new Error("Enter a quiz title and questions.");
  const { title, questions } = value as Record<string, unknown>;
  if (typeof title !== "string" || !title.trim() || title.length > 160)
    throw new Error("Enter a title of up to 160 characters.");
  if (
    !Array.isArray(questions) ||
    questions.length < 1 ||
    questions.length > 30
  )
    throw new Error("Add between 1 and 30 questions.");
  const checked = questions.map((q, i) => {
    if (!q || typeof q !== "object" || !Object.hasOwn(questionTypes, q.type))
      throw new Error("Choose a valid question type.");
    if (
      typeof q.prompt !== "string" ||
      !q.prompt.trim() ||
      q.prompt.length > 1000
    )
      throw new Error(`Enter question ${i + 1} (up to 1,000 characters).`);
    if (
      typeof q.answer !== "string" ||
      !q.answer.trim() ||
      q.answer.length > 2000
    )
      throw new Error(`Enter the answer to question ${i + 1}.`);
    const options =
      q.type === "true_false"
        ? ["True", "False"]
        : q.type === "multiple_choice"
          ? q.options
          : [];
    if (
      !Array.isArray(options) ||
      options.length > 8 ||
      options.some((o) => typeof o !== "string" || !o.trim() || o.length > 200)
    )
      throw new Error("Use up to 8 options, each up to 200 characters.");
    const normalized = options.map((o: string) => o.trim());
    if (
      ["multiple_choice", "true_false"].includes(q.type) &&
      (normalized.length < 2 ||
        new Set(normalized).size !== normalized.length ||
        !normalized.includes(q.answer.trim()))
    )
      throw new Error(
        `Question ${i + 1}: the correct answer must match a unique option.`,
      );
    return {
      id: i + 1,
      type: q.type,
      prompt: q.prompt.trim(),
      answer: q.answer.trim(),
      options: normalized,
    } as DemoQuestion;
  });
  return { title: title.trim(), questions: checked };
}

export function publicQuiz(quiz: SharedQuiz) {
  return {
    id: quiz.id,
    title: quiz.title,
    questions: quiz.questions.map(({ id, type, prompt, options }) => ({
      id,
      type,
      prompt,
      options,
    })),
  };
}
