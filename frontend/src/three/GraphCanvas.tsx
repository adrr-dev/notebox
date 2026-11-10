/**
 * Canvas mount point: hands the container to the engine singleton on mount and
 * tears the scene down on unmount (React StrictMode double-mount safe).
 */
import { useEffect, useRef } from 'react';
import { engine } from './engine';

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    engine.mount(element);
    return () => engine.dispose();
  }, []);

  return <div id="canvas-container" ref={containerRef} className="canvas-container" />;
}
