import { useMemo, useState } from 'react'
import { parseDocument, parseQuiz } from '../../lib/skdown'

export function QuizRenderer({ content }: { content: string }) {
  const questions = useMemo(() => parseQuiz(parseDocument(content)), [content])
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [submitted, setSubmitted] = useState(false)

  if (questions.length === 0) {
    return (
      <p className="muted">
        This quiz has no questions yet. Add one with a block like:{' '}
        <code>:::question title="..."</code> containing a task list (
        <code>- [ ] wrong</code> / <code>- [x] right</code>).
      </p>
    )
  }

  const score = questions.reduce((acc, q) => {
    const pick = selected[q.id]
    return acc + (pick !== undefined && q.options[pick]?.correct ? 1 : 0)
  }, 0)

  return (
    <div className="quiz-renderer">
      {questions.map((q) => (
        <div className="quiz-question" key={q.id}>
          <h4>{q.title}</h4>
          {q.options.map((opt, i) => {
            const isPicked = selected[q.id] === i
            const revealClass = submitted
              ? opt.correct
                ? 'correct-reveal'
                : isPicked
                  ? 'incorrect-reveal'
                  : ''
              : ''
            return (
              <label key={i} className={`quiz-option ${revealClass}`}>
                <input
                  type="radio"
                  name={q.id}
                  checked={isPicked}
                  disabled={submitted}
                  onChange={() => setSelected((s) => ({ ...s, [q.id]: i }))}
                />
                {opt.text}
              </label>
            )
          })}
        </div>
      ))}
      {!submitted ? (
        <button className="primary" onClick={() => setSubmitted(true)}>
          Submit answers
        </button>
      ) : (
        <div className="row">
          <strong>
            Score: {score} / {questions.length}
          </strong>
          <button
            className="subtle"
            onClick={() => {
              setSubmitted(false)
              setSelected({})
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
