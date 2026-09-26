export type Profile = {
  id: string
  name: string
  email: string
  is_admin: boolean
  disabled_at: string | null
  created_at: string
}

export type Quiz = {
  id: number
  user_id: string
  title: string
  description: string | null
  is_published: boolean
  share_token: string
  lockdown_enabled: boolean
  created_at: string
  updated_at: string
  questions_count?: number
}

export type QuestionType = 'multiple_choice' | 'identification'

export type Question = {
  id: number
  quiz_id: number
  type: QuestionType
  prompt: string
  options: string[] | null
  correct_index: number | null
  answer_text: string | null
  explanation: string | null
  created_at: string
}

export type AttemptQuestionView = {
  id: number
  type: QuestionType
  prompt: string
  options: string[] | null
  explanation: string | null
  selected_index: number | null
  answer_text: string | null
  is_correct: boolean | null
}

export type TerminationReason = 'tab_switch' | 'blur' | 'fullscreen_exit' | 'devtools' | null

export type AttemptPayload = {
  id: number
  quiz: { id: number; title: string; description: string | null }
  started_at: string
  completed_at: string | null
  score: number | null
  total_questions: number | null
  student_name: string | null
  student_number: string | null
  termination_reason: TerminationReason
  questions: AttemptQuestionView[]
}

export type AttemptRow = {
  id: number
  started_at: string
  completed_at: string | null
  score: number | null
  total_questions: number | null
  student_name: string | null
  student_number: string | null
  termination_reason: TerminationReason
}
