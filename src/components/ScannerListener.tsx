import { useEffect, useRef } from 'react';

type Props = {
  onScan: (code: string) => void;
  accept?: (code: string) => boolean;
};

function normalize(raw: string) {
  return raw.trim().replace(/^(ABS|LIB):/i, '').toUpperCase();
}

const defaultAccept = (code: string) => /^(STU|TCH|BK)-\d{4}-\d{6}$/.test(code);

export function ScannerListener({ onScan, accept = defaultAccept }: Props) {
  const buffer = useRef('');
  const last = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const now = performance.now();
      if (now - last.current > 120) buffer.current = '';
      last.current = now;

      if (e.key === 'Enter') {
        const code = normalize(buffer.current);
        buffer.current = '';
        if (code && accept(code)) {
          e.preventDefault();
          onScan(code);
        }
        return;
      }

      if (e.key.length === 1) buffer.current += e.key;
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [accept, onScan]);

  return null;
}
