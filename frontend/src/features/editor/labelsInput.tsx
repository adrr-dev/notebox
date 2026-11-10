/**
 * Label (kategori) chip editor for the object editor.
 *
 * Ported from the legacy label bar (legacy markup L3710-3725, behaviour
 * L6954-6985): Enter or comma commits a chip, chips are lower-cased and
 * de-duplicated, and the datalist is fed by every label already used in the
 * workspace.
 */
import { useId, useState } from 'react';

export interface LabelsInputProps {
  labels: string[];
  onChange: (labels: string[]) => void;
  /** Existing workspace labels offered through the datalist. */
  suggestions: string[];
}

export function LabelsInput({ labels, onChange, suggestions }: LabelsInputProps) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  const commit = () => {
    const value = draft.trim().toLowerCase();
    if (value && !labels.includes(value)) onChange([...labels, value]);
    setDraft('');
  };

  return (
    <div className="mt-4">
      <label
        htmlFor={`${listId}-input`}
        className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400"
      >
        Label / Kategori <span className="font-normal lowercase text-slate-500">(Tekan Enter)</span>
      </label>
      <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 p-2.5 transition-all focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
        {labels.map((label) => (
          <span key={label} className="tag-chip">
            {label}
            <button
              type="button"
              onClick={() => onChange(labels.filter((item) => item !== label))}
              aria-label={`Hapus label ${label}`}
              className="ml-1 cursor-pointer hover:text-red-400"
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={`${listId}-input`}
          type="text"
          autoComplete="off"
          list={listId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              commit();
            }
          }}
          placeholder="+ Ketik tag..."
          className="min-w-[120px] flex-1 border-none bg-transparent text-sm text-white outline-none"
        />
        <datalist id={listId}>
          {suggestions.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
