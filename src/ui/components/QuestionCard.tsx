import type { ReactNode } from 'react';
import type { Question } from '../../core/template';
import { topicName } from '../../core/topics';
import { MathText } from './MathText';

/** The question panel: topic and level line, the stem, then whatever answer UI is passed as children. */
export function QuestionCard({ question, children, meta }: { question: Question; children?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="card q-card">
      <div className="q-meta">
        <span>{topicName(question.topic)}</span>
        <span className="pill">Level {question.level}</span>
        {meta}
      </div>
      <MathText className="q-stem" text={question.stem} />
      {children}
    </div>
  );
}
