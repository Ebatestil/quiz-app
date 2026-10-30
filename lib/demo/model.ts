export type DemoQuestion = {
  id: number
  type: 'multiple_choice' | 'true_false' | 'identification' | 'enumeration'
  prompt: string
  options: string[]
  answer: string
}
export type DemoClass = {
  id: number
  name: string
  students: { id: number; first: string; last: string }[]
}
export type DemoQuiz = {
  id: number
  title: string
  description: string
  published: boolean
  classIds: number[]
  minutes: number
  date: string
  lockdown: boolean
  questions: DemoQuestion[]
}
export type DemoResult = {
  id: number
  quizId: number
  classId: number
  studentId: number
  name: string
  section: string
  score: number
  total: number
  reason: string
  answers: string[]
  questions: DemoQuestion[]
}
export type DemoWorkspace = {
  classes: DemoClass[]
  quizzes: DemoQuiz[]
  results: DemoResult[]
}
export const normalizeName = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase()
export function isCorrect(question: DemoQuestion, answer: string) {
  if (question.type === 'enumeration') {
    const list = (text: string) =>
      text.split(/\r?\n/).map(normalizeName).filter(Boolean).sort()
    return (
      list(answer).length > 0 &&
      JSON.stringify(list(answer)) === JSON.stringify(list(question.answer))
    )
  }
  return (
    !!normalizeName(answer) &&
    normalizeName(question.answer) === normalizeName(answer)
  )
}
export function seedDemo(): DemoWorkspace {
  const questions: DemoQuestion[] = [
    {
      id: 1,
      type: 'multiple_choice',
      prompt: 'Which planet is known as the Red Planet?',
      options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
      answer: 'Mars',
    },
    {
      id: 2,
      type: 'true_false',
      prompt: 'Plants use sunlight to make food through photosynthesis.',
      options: ['True', 'False'],
      answer: 'True',
    },
    {
      id: 3,
      type: 'identification',
      prompt: 'What force keeps planets in orbit around the Sun?',
      options: [],
      answer: 'Gravity',
    },
    {
      id: 4,
      type: 'enumeration',
      prompt: 'List the three common states of matter, one per line.',
      options: [],
      answer: 'Solid\nLiquid\nGas',
    },
  ]
  return {
    classes: [
      {
        id: 1,
        name: 'Grade 7 — Curiosity',
        students: [
          { id: 1, first: 'Alex', last: 'Reyes' },
          { id: 2, first: 'Sam', last: 'Rivera' },
          { id: 3, first: 'Mika', last: 'Cruz' },
        ],
      },
      {
        id: 2,
        name: 'Grade 7 — Discovery',
        students: [{ id: 4, first: 'Robin', last: 'Santos' }],
      },
    ],
    quizzes: [
      {
        id: 1,
        title: 'A little science, a lot of curiosity',
        description: 'Explore four question types in a short classroom quiz.',
        published: true,
        classIds: [1, 2],
        minutes: 5,
        date: '',
        lockdown: true,
        questions,
      },
    ],
    results: [
      {
        id: 1,
        quizId: 1,
        classId: 1,
        studentId: 2,
        name: 'Sam Rivera',
        section: 'Grade 7 — Curiosity',
        score: 3,
        total: 4,
        reason: 'Sample submission',
        answers: ['Mars', 'True', 'Magnetism', 'Gas\nSolid\nLiquid'],
        questions: structuredClone(questions),
      },
    ],
  }
}
