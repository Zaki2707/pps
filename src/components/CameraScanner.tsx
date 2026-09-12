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

export function CameraScanner({ active, onScan, onClose, accept, title = 'Scan dengan Kamera' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const last = useRef({ code: '', at: 0 });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let controls: { stop: () => void } | undefined;
    const reader = new BrowserMultiFormatReader();

    async function start() {
      setError('');
      if (!cameraAllowedHere()) {
        setError('Kamera browser memerlukan HTTPS saat aplikasi dibuka dari PC/HP lain di jaringan LAN.');
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
      } catch (e: any) {
        if (!cancelled) {
          const message =
            e?.name === 'NotAllowedError'
              ? 'Izin kamera ditolak. Izinkan kamera pada browser lalu coba lagi.'
              : e?.name === 'NotFoundError'
                ? 'Kamera tidak ditemukan pada perangkat ini.'
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
  }, [active, accept, onScan]);

  if (!active) return null;

  return <div className="camera-shell" role="dialog" aria-modal="true" aria-label={title}>
    <div className="camera-card">
      <div className="camera-head">
        <div><strong>{title}</strong><small>Arahkan barcode ke area kamera.</small></div>
        <button type="button" className="camera-close" onClick={onClose} aria-label="Tutup kamera">×</button>
      </div>
      <div className="camera-preview">
        <video ref={videoRef} muted playsInline autoPlay />
        <div className="camera-target" aria-hidden="true" />
        {starting && <div className="camera-status">Membuka kamera…</div>}
      </div>
      {error && <div className="camera-error">{error}</div>}
      <p className="camera-help">Mendukung barcode anggota, barcode buku, ISBN/EAN, dan QR. Barcode yang tidak sesuai konteks akan diabaikan.</p>
    </div>
  </div>;
}
