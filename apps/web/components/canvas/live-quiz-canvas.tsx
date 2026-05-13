'use client';

import { useEffect, useMemo, useState } from 'react';

import { calculateQuizScore, formatCountdown, type QuizAnswerMap } from '@/lib/canvas/quiz';
import type { LiveQuizCanvasEnvelope } from '@/lib/canvas/types';

type LiveQuizCanvasProps = {
  canvas: LiveQuizCanvasEnvelope;
};

export function LiveQuizCanvas({ canvas }: LiveQuizCanvasProps) {
  const { quiz_title, questions, time_limit_seconds } = canvas.payload;
  const [answers, setAnswers] = useState<QuizAnswerMap>({});
  const [timeLeft, setTimeLeft] = useState(time_limit_seconds);
  const [submitted, setSubmitted] = useState(false);
  const [submissionReason, setSubmissionReason] = useState<'manual' | 'timeout' | null>(null);

  const answeredCount = useMemo(
    () => questions.filter((question) => answers[question.id] !== undefined).length,
    [answers, questions],
  );
  const score = useMemo(() => calculateQuizScore(questions, answers), [answers, questions]);

  useEffect(() => {
    if (submitted) {
      return;
    }

    if (timeLeft <= 0) {
      setSubmitted(true);
      setSubmissionReason('timeout');
      return;
    }

    const timer = window.setTimeout(() => {
      setTimeLeft((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [submitted, timeLeft]);

  function handleSelectAnswer(questionId: string, optionIndex: number) {
    if (submitted) {
      return;
    }

    setAnswers((current) => ({
      ...current,
      [questionId]: optionIndex,
    }));
  }

  function handleSubmit() {
    setSubmitted(true);
    setSubmissionReason('manual');
  }

  return (
    <div className="quiz-shell">
      <div className="quiz-header">
        <div className="quiz-title-block">
          <p className="eyebrow">Live Quiz</p>
          <h3 className="quiz-title">{quiz_title}</h3>
          <p className="quiz-meta">
            {questions.length} questions · {answeredCount} answered
          </p>
        </div>

        <div className="quiz-header-actions">
          <div className="quiz-timer" data-expired={String(timeLeft === 0)}>
            <span>Time Left</span>
            <strong>{formatCountdown(timeLeft)}</strong>
          </div>
          {!submitted ? (
            <button className="primary-button" type="button" onClick={handleSubmit}>
              Submit Quiz
            </button>
          ) : null}
        </div>
      </div>

      <div className="quiz-scroll">
        {submitted ? (
          <section className="quiz-score-card">
            <p className="eyebrow">Review Mode</p>
            <h4>
              Score: {score.correctCount}/{score.totalQuestions} ({score.percentage}%)
            </h4>
            <p>
              {submissionReason === 'timeout'
                ? 'Time ran out, so the quiz was submitted automatically.'
                : 'Your answers were graded instantly on the client side.'}
            </p>
          </section>
        ) : null}

        <div className="quiz-question-list">
          {questions.map((question, questionIndex) => {
            const selectedAnswer = answers[question.id];

            return (
              <article key={question.id} className="quiz-question-card">
                <div className="quiz-question-head">
                  <span className="quiz-question-index">Q{questionIndex + 1}</span>
                  <h4>{question.question_text}</h4>
                </div>

                <div className="quiz-option-list">
                  {question.options.map((option, optionIndex) => {
                    const isSelected = selectedAnswer === optionIndex;
                    const isCorrect = question.correct_answer_index === optionIndex;

                    let optionState: 'idle' | 'selected' | 'correct' | 'incorrect' = 'idle';
                    if (!submitted && isSelected) {
                      optionState = 'selected';
                    }
                    if (submitted && isCorrect) {
                      optionState = 'correct';
                    }
                    if (submitted && isSelected && !isCorrect) {
                      optionState = 'incorrect';
                    }

                    return (
                      <label
                        key={`${question.id}-${optionIndex}`}
                        className="quiz-option"
                        data-state={optionState}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          checked={isSelected}
                          onChange={() => handleSelectAnswer(question.id, optionIndex)}
                          disabled={submitted}
                        />
                        <span className="quiz-option-marker">
                          {String.fromCharCode(65 + optionIndex)}
                        </span>
                        <span className="quiz-option-text">{option}</span>
                      </label>
                    );
                  })}
                </div>

                {submitted ? (
                  <div className="quiz-explanation">
                    <strong>Explanation</strong>
                    <p>{question.explanation}</p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {!submitted ? (
          <div className="quiz-footer">
            <button className="primary-button" type="button" onClick={handleSubmit}>
              Submit Quiz
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
