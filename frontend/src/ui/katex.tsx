/**
 * KaTeX helpers shared by every surface that shows mathematical notation:
 * the description editor preview, the read view, the syntax dictionary and the
 * math evaluator.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useEffect, useRef } from 'react';

/** Renders every `$…$` / `$$…$$` / `\(…\)` fragment inside an element. */
export function renderMathIn(element: HTMLElement | null): void {
  if (!element) return;
  element.querySelectorAll<HTMLElement>('[data-math]').forEach((node) => {
    const source = node.dataset.math ?? '';
    try {
      katex.render(source, node, { throwOnError: false, displayMode: node.dataset.mathDisplay === 'true' });
    } catch {
      node.textContent = source;
    }
  });
}

/** Renders one expression into `container`, reporting failure inline. */
export function renderMathInto(container: HTMLElement | null, expression: string, displayMode = false): void {
  if (!container) return;
  try {
    katex.render(expression, container, { throwOnError: false, displayMode });
  } catch {
    container.textContent = expression;
  }
}

export interface KatexMathProps {
  expression: string;
  displayMode?: boolean;
  className?: string;
}

/** Renders one KaTeX expression as a React element. */
export function KatexMath({ expression, displayMode = false, className }: KatexMathProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    renderMathInto(ref.current, expression, displayMode);
  }, [expression, displayMode]);

  return <span ref={ref} className={className} />;
}
