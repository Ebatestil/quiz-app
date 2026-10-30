import { AnswerQuiz } from "./AnswerQuiz";
export const metadata = { title: "Take a quiz · Quiz App" };
export default async function QuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <AnswerQuiz id={(await params).id} />;
}
