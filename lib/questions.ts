import type { QuestionType } from './types'

export const questionTypeLabels: Record<QuestionType, string> = {
  multiple_choice: 'Multiple choice',
  identification: 'Identification',
  true_false: 'True or false',
  enumeration: 'Enumeration',
}

export function isChoiceQuestion(type: QuestionType) {
  return type === 'multiple_choice' || type === 'true_false'
}

export function answerInstructions(type: QuestionType) {
  return type === 'enumeration'
    ? 'Enter one answer per line. Order does not matter. All answers must match to earn one point.'
    : 'Type your answer, then select Save answer.'
}
