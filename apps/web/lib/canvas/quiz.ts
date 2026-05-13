import type { LiveQuizQuestion } from '@/lib/canvas/types';

export type QuizAnswerMap = Record<string, number | undefined>;

export type QuizScoreSummary = {
  correctCount: number;
  totalQuestions: number;
  percentage: number;
};

export function calculateQuizScore(
  questions: LiveQuizQuestion[],
  answers: QuizAnswerMap,
): QuizScoreSummary {
  const correctCount = questions.reduce((count, question) => {
    return count + (answers[question.id] === question.correct_answer_index ? 1 : 0);
  }, 0);

  const totalQuestions = questions.length;
  const percentage =
    totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 100);

  return {
    correctCount,
    totalQuestions,
    percentage,
  };
}

export function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
