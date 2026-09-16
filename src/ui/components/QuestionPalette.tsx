export interface PaletteItem {
  answered: boolean;
  flagged: boolean;
  noAnswer: boolean;
}

/** Exam-style question navigator: one numbered button per question. */
export function QuestionPalette({ items, current, onPick }: { items: PaletteItem[]; current: number; onPick: (index: number) => void }) {
  return (
    <div className="card palette-card">
      <div className="palette" role="navigation" aria-label="Questions">
        {items.map((it, i) => {
          const cls = ['pal'];
          if (i === current) cls.push('current');
          if (it.answered) cls.push('answered');
          else if (it.noAnswer) cls.push('noanswer');
          if (it.flagged) cls.push('flagged');
          const state = it.answered ? 'answered' : it.noAnswer ? 'no answer' : 'unanswered';
          return (
            <button key={i} type="button" className={cls.join(' ')} aria-current={i === current ? 'true' : undefined}
              title={`Question ${i + 1}: ${state}${it.flagged ? ', flagged' : ''}`}
              onClick={(e) => { e.currentTarget.blur(); onPick(i); }}>
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="palette-legend">
        <span><i className="sw answered" /> answered</span>
        <span><i className="sw" /> unanswered</span>
        <span><i className="sw noanswer" /> no answer</span>
        <span><i className="sw flagged" /> flagged</span>
      </div>
    </div>
  );
}
