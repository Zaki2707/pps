import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

type Props = {
  active: boolean;
  onScan: (code: string) => void | Promise<void>;
  onClose: () => void;
  accept?: (code: string) => boolean;
  title?: string;
};

function normalize(raw: string) {
  return raw.trim().replace(/^(ABS|LIB):/i, '').toUpperCase();
}

function cameraAllowedHere() {
  if (window.isSecureContext) return true;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function embeddedPreview() {
  try { return window.self !== window.top; } catch { return true; }
}

export function CameraScanner({ active, onScan, onClose, accept, title = 'Scan dengan Kamera' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [ready, setReady] = useState(false);
  const embedded = embeddedPreview();
  const last = useRef({ code: '', at: 0 });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let controls: { stop: () => void } | undefined;
    const reader = new BrowserMultiFormatReader();

    async function start() {
      setError('');
      setReady(false);

      if (!cameraAllowedHere()) {
        setError('Kamera memerlukan HTTPS atau localhost. Jika ini preview, buka preview di tab baru.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Browser ini tidak mendukung akses kamera.');
        return;
      }
      if (!videoRef.current) return;

      setStarting(true);
      try {
        controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          },
          videoRef.current,
          (result) => {
            if (!result || cancelled) return;
            const code = normalize(result.getText());
            if (!code || (accept && !accept(code))) return;

            const now = Date.now();
            if (last.current.code === code && now - last.current.at < 1600) return;
            last.current = { code, at: now };
            void Promise.resolve(onScan(code)).catch(() => {});
          }
        );
        if (!cancelled) setReady(true);
      } catch (e: any) {
        if (!cancelled) {
          const message =
            e?.name === 'NotAllowedError'
              ? (embedded
                  ? 'Preview tertanam memblokir izin kamera. Buka preview di tab baru lalu izinkan kamera.'
                  : 'Izin kamera ditolak. Izinkan kamera pada pengaturan situs lalu coba lagi.')
              : e?.name === 'NotFoundError'
                ? 'Kamera tidak ditemukan pada perangkat ini.'
                : e?.name === 'NotReadableError'
                  ? 'Kamera sedang dipakai aplikasi lain atau tidak dapat diakses.'
                  : (e?.message || 'Kamera tidak dapat dibuka.');
          setError(message);
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    }

    void start();
    return () => {
      cancelled = true;
      try { controls?.stop(); } catch {}
      const stream = videoRef.current?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [active, accept, embedded, onScan]);

  if (!active) return null;

  const openStandalone = () => {
    const opened = window.open(window.location.href, '_blank', 'noopener,noreferrer');
    if (!opened) setError('Tab baru diblokir browser. Gunakan tombol pop-out / open in new tab pada preview.');
  };

  return <div className="camera-shell" role="dialog" aria-modal="true" aria-label={title}>
    <div className="camera-card">
      <div className="camera-head">
        <div><strong>{title}</strong><small>Arahkan barcode ke area kamera.</small></div>
        <button type="button" className="camera-close" onClick={onClose} aria-label="Tutup kamera">×</button>
      </div>

      {embedded && <div className="camera-preview-note">
        Preview terdeteksi berada di dalam iframe. Jika kamera tidak muncul, buka aplikasi sebagai tab mandiri.
        <button type="button" onClick={openStandalone}>Buka di tab baru</button>
      </div>}

      <div className="camera-preview">
        <video ref={videoRef} muted playsInline autoPlay />
        <div className="camera-target" aria-hidden="true" />
        {starting && <div className="camera-status">Meminta izin kamera…</div>}
        {ready && !starting && <div className="camera-status camera-ready">● Kamera aktif</div>}
      </div>

      {error && <div className="camera-error">
        {error}
        {embedded && <button type="button" onClick={openStandalone}>Buka di tab baru</button>}
      </div>}

      <p className="camera-help">Video diproses langsung di browser dan tidak dikirim ke server.</p>
    </div>
  </div>;
}
