import type { Option } from '../../core/template';
import { MathText } from './MathText';

interface Props {
  options: Option[];
  /** highlighted / recorded option key */
  selected: string | null;
  /** show which option is correct and mark a wrong selection */
  revealed?: boolean;
  disabled?: boolean;
  onSelect: (key: string) => void;
}

/** Lettered A–H option buttons. Touch targets are at least 52px tall (see .option). */
export function OptionList({ options, selected, revealed = false, disabled = false, onSelect }: Props) {
  return (
    <div className="options" role="listbox" aria-label="Answer options">
      {options.map((o) => {
        const isSel = selected === o.key;
        const cls = ['option'];
        if (revealed) {
          if (o.correct) cls.push('correct');
          else if (isSel) cls.push('wrong');
        } else if (isSel) cls.push('selected');
        return (
          <button
            key={o.key}
            type="button"
            className={cls.join(' ')}
            role="option"
            aria-selected={isSel}
            disabled={disabled || revealed}
            onClick={(e) => { e.currentTarget.blur(); onSelect(o.key); }}
          >
            <span className="key">{o.key}</span>
            <MathText inline text={o.display} />
            {revealed && isSel && !o.correct && <span className="trap">your answer</span>}
            {revealed && o.correct && <span className="trap">{isSel ? 'your answer' : 'correct'}</span>}
          </button>
        );
      })}
    </div>
  );
}
