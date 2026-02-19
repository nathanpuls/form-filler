import { useState, useEffect, useRef, useCallback } from 'react';

const QUESTIONS_CONFIG = `Anxiety: denies, mild, moderate, severe
Depression: denies, mild, moderate, severe
Anhedonia: denies, mild, moderate, severe
Sleep quality: within normal limits, fair, poor
Sleep (hours): 1, 2, 3, 4, 5, 6, 7, 8+
Energy: within normal limits, fair, poor
Appetite: within normal limits, fair, poor
Concentration: within normal limits, fair, poor
Irritability: within normal limits, fair, poor
SI/SH: denies, active, passive
Psychosis: denies, present
Mania-Hypomania: absent, present
Substance Use: denied, reported
Medication Adherence: adherent, non-adherent
Medication Side Effects: denies
* ADHD: denies, history of seizures, cardiac disease, migraines, eating disorder, weight changes
OCD: denies symptoms, endorses symptoms
Trauma: denies, present
Psychiatric Hospitalization: denies
Medical: denies
Social: support present, denies support
Females: N/A, pregnant, not pregnant`;

const STATIC_FOOTER = `
**TREATMENT PLAN**

**Psychiatric**:
Discussed diagnosis, medications, risks/benefits, side effects (including black box warnings).
Patient had opportunity for questions and provided informed consent.
Encouraged completion of follow-up scales.

**Medical**: Defer

**Psychosocial**:
Reinforced importance of exercise, nutrition, sleep hygiene, routine, socialization, and sobriety.

**Safety**:
Safety plan reviewed.
Advised to contact office for worsening symptoms or medication concerns.
Instructed to call 911 or go to ER for emergencies (SI/HI, inability to care for self).
Patient verbalized understanding.

Nathan Puls, APRN maintains a collaborative relationship with supervising physician, Dr. Siddiqui.`;

const questions = QUESTIONS_CONFIG.split('\n')
  .filter(l => l.trim())
  .map((line, idx) => {
    const isMultiSelect = line.startsWith('*');
    const clean = line.replace(/^\*/, '').trim();
    const [label, rawChoices] = clean.split(':');
    const choices = rawChoices ? rawChoices.split(',').map((c, i) => ({ id: i, text: c.trim() })) : [];
    return { id: idx, label: label.trim(), choices, isMultiSelect };
  });

const getInitialAnswers = () => {
  const saved = localStorage.getItem('form_filler_answers');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse saved answers", e);
    }
  }
  const initial: Record<number, { selected: number[], text: string }> = {};
  const femalesIdx = questions.findIndex(q => q.label === 'Females');
  if (femalesIdx !== -1) {
    initial[femalesIdx] = { selected: [0], text: '' };
  }
  return initial;
};

export default function App() {
  const [answers, setAnswers] = useState<Record<number, { selected: number[], text: string }>>(getInitialAnswers);
  const [activeIdx, setActiveIdx] = useState(() => {
    const saved = localStorage.getItem('form_filler_active_idx');
    return saved ? parseInt(saved) : 0;
  });
  const [showToast, setShowToast] = useState(false);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 1. Core Logic Functions (useCallback)
  // Must be defined before they are used in useEffect or JSX

  const updateText = useCallback((qId: number, val: string) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: { selected: prev[qId]?.selected || [], text: val }
    }));
  }, []);

  const getFullNote = useCallback((asHtml: boolean) => {
    const lines = questions.map(q => {
      const ans = answers[q.id];

      // Skip Females if N/A (index 0) is selected
      if (q.label === 'Females' && ans?.selected.includes(0)) return null;

      const selected = ans?.selected.map(i => {
        let val = q.choices[i].text;
        if (q.label === 'Females') {
          if (val === 'pregnant') val = 'is pregnant/breastfeeding. Advised to notify provider if status changes.';
          if (val === 'not pregnant') val = 'is not pregnant/breastfeeding. Advised to notify provider if status changes.';
        }
        if (q.label.startsWith('Sleep') && !isNaN(Number(val.charAt(0)))) {
          const isSingular = val === '1';
          val = 'about ' + val + (isSingular ? ' hour' : ' hours');
        }
        return val;
      }) || [];
      if (ans?.text) selected.push(ans.text);
      const label = asHtml ? `<b>${q.label}</b>` : q.label;
      return `${label}: ${selected.join(', ') || 'n/a'}`;
    }).filter(Boolean);

    let footer = STATIC_FOOTER;
    if (asHtml) {
      footer = footer.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    } else {
      footer = footer.replace(/\*\*/g, '');
    }

    return lines.join(asHtml ? '<br>' : '\n') + (asHtml ? '<br><br>' : '\n\n') + footer;
  }, [answers]);

  const copyNote = useCallback(() => {
    const plainText = getFullNote(false);
    const htmlText = getFullNote(true);

    const textBlob = new Blob([plainText], { type: 'text/plain' });
    const htmlBlob = new Blob([htmlText], { type: 'text/html' });

    const item = new ClipboardItem({
      'text/plain': textBlob,
      'text/html': htmlBlob
    });

    navigator.clipboard.write([item]).then(() => {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    });
  }, [getFullNote]);

  const selectChoice = useCallback((qId: number, cId: number) => {
    const q = questions[qId];
    setAnswers(prev => {
      const current = prev[qId]?.selected || [];
      const text = prev[qId]?.text || '';
      let nextSelected;

      if (q.isMultiSelect) {
        const isAlreadySelected = current.includes(cId);
        nextSelected = isAlreadySelected ? current.filter(i => i !== cId) : [...current, cId];

        if (q.label === 'ADHD') {
          if (cId === 0 && !isAlreadySelected) {
            nextSelected = [0];
            setTimeout(() => {
              if (activeIdx < questions.length - 1) setActiveIdx(activeIdx + 1);
              else copyNote();
            }, 100);
          } else if (cId !== 0 && !isAlreadySelected) {
            nextSelected = nextSelected.filter(i => i !== 0);
          }
        }
      } else {
        const isAlreadySelected = current.includes(cId);
        nextSelected = isAlreadySelected ? [] : [cId];
        if (!isAlreadySelected) {
          setTimeout(() => {
            if (activeIdx < questions.length - 1) setActiveIdx(activeIdx + 1);
            else copyNote();
          }, 100);
        }
      }
      return { ...prev, [qId]: { selected: nextSelected, text } };
    });
  }, [activeIdx, copyNote]);

  const reset = useCallback(() => {
    setAnswers(getInitialAnswers());
    setActiveIdx(0);
    setShowToast(false);
    localStorage.removeItem('form_filler_answers');
    localStorage.removeItem('form_filler_active_idx');
    window.scrollTo(0, 0);
  }, []);

  // 2. Lifecycle Effects

  useEffect(() => {
    localStorage.setItem('form_filler_answers', JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    localStorage.setItem('form_filler_active_idx', String(activeIdx));
  }, [activeIdx]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLInputElement) return;

      const q = questions[activeIdx];

      // Letter navigation (a-z)
      const key = e.key.toLowerCase();
      if (e.key.length === 1 && key >= 'a' && key <= 'z') {
        const charCode = key.charCodeAt(0);
        const index = charCode - 97; // 97 is 'a'
        if (index >= 0 && index < questions.length) {
          e.preventDefault();
          setActiveIdx(index);
          return;
        }
      }

      if (e.key >= '1' && e.key <= '9') {
        const choiceIdx = parseInt(e.key) - 1;
        if (choiceIdx < q.choices.length) {
          e.preventDefault();
          selectChoice(activeIdx, choiceIdx);
        }
      } else if (e.key === '0') {
        e.preventDefault();
        inputRefs.current[activeIdx]?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx < questions.length - 1) setActiveIdx(activeIdx + 1);
        else copyNote();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (activeIdx > 0) setActiveIdx(activeIdx - 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeIdx, copyNote, selectChoice]);

  useEffect(() => {
    rowRefs.current[activeIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeIdx]);

  return (
    <div className="container">
      {showToast && <div className="toast">Copied!</div>}
      <header>
        <h1>Clinical Form Filler</h1>
        <div>
          <button onClick={copyNote}>Copy Note</button>
          <button onClick={reset}>Clear All</button>
        </div>
      </header>

      <table className="q-table">
        <tbody>
          {questions.map((q, idx) => (
            <tr
              key={q.id}
              ref={el => { rowRefs.current[idx] = el; }}
              className={`q-row ${activeIdx === idx ? 'active' : ''}`}
              onClick={() => setActiveIdx(idx)}
            >
              <td className="q-label">
                <span style={{ color: 'var(--accent)', opacity: 0.8, marginRight: '8px', fontSize: '12px', fontWeight: 'bold' }}>{String.fromCharCode(65 + idx)}</span>
                {q.label}
              </td>
              <td className="q-controls">
                {q.choices.map((c, cidx) => {
                  const isSelected = answers[q.id]?.selected.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      className={isSelected ? 'selected' : ''}
                      onClick={(e) => { e.stopPropagation(); selectChoice(q.id, c.id); }}
                    >
                      {!c.text.startsWith(String(cidx + 1)) && (
                        <span style={{
                          color: isSelected ? '#fff' : 'var(--accent)',
                          opacity: 0.8,
                          marginRight: '3px',
                          fontWeight: 'bold'
                        }}>{cidx + 1}</span>
                      )}
                      {c.text}
                    </button>
                  );
                })}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '12px' }}>0</span>
                  <input
                    className="other-input"
                    ref={el => { inputRefs.current[idx] = el; }}
                    value={answers[q.id]?.text || ''}
                    onChange={(e) => updateText(q.id, e.target.value)}
                    onClick={(e) => { e.stopPropagation(); setActiveIdx(idx); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (activeIdx < questions.length - 1) setActiveIdx(activeIdx + 1);
                        else copyNote();
                      } else if (e.key === 'Escape') {
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
