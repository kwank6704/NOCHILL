'use client';

import { useRef, useState } from 'react';

type Props = {
  /** Return false to refuse the hold (e.g. nothing to shred). */
  onStart(): boolean | void;
  onEnd(): void;
  label: string;
  holdingLabel: string;
  tone?: 'rage' | 'shred';
  disabled?: boolean;
  /** Parent writes `--p` (0–100) onto this element every frame for the progress ring. */
  ref?: React.Ref<HTMLButtonElement>;
};

export function HoldButton({ onStart, onEnd, label, holdingLabel, tone = 'rage', disabled, ref }: Props) {
  const [holding, setHolding] = useState(false);
  const active = useRef(false);

  const start = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || active.current || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (onStart() === false) return;
    active.current = true;
    setHolding(true);
  };

  const end = () => {
    if (!active.current) return;
    active.current = false;
    setHolding(false);
    onEnd();
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`hold hold-${tone}${holding ? ' is-holding' : ''}`}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
    >
      <span className="hold-ring" />
      <span className="hold-core">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
          <path
            d="M12 3v7M8.5 6.5c-3 1-5 3.8-5 7.5 0 3 1.5 5.5 4 6.5 1.5.6 3-.4 3-2V12M15.5 6.5c3 1 5 3.8 5 7.5 0 3-1.5 5.5-4 6.5-1.5.6-3-.4-3-2V12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span className="hold-label">{holding ? holdingLabel : label}</span>
      </span>
    </button>
  );
}
