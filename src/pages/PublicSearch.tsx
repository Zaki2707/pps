import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ScannerListener } from '../components/ScannerListener';
import { CameraScanner } from '../components/CameraScanner';

type Book = { id:string; title:string; author_text?:string; category?:string; shelf_code?:string; total:number; available:number; borrowed:number; damaged:number; cover_url?:string };
type VisitSource = 'usb' | 'camera';

const demoBooks: Book[] = [
  {id:'demo-1',title:'Laskar Pelangi',author_text:'Andrea Hirata',category:'Novel',shelf_code:'D-04',total:10,available:4,borrowed:5,damaged:1},
  {id:'demo-2',title:'Bahasa Arab Kelas XI',author_text:'Tim Penyusun',category:'Pelajaran',shelf_code:'A-04',total:20,available:17,borrowed:2,damaged:1},
  {id:'demo-3',title:'Fisika Kelas XI',author_text:'Tim Penyusun',category:'Pelajaran',shelf_code:'C-02',total:8,available:2,borrowed:6,damaged:0}
];

const isMemberCode = (code:string) => /^(STU|TCH)-\d{4}-\d{6}$/.test(code);

function beep(ok=true) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx(); const osc=ctx.createOscillator(); const gain=ctx.createGain();
    osc.frequency.value=ok?880:220; gain.gain.value=.08; osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + (ok ? 0.09 : 0.18));
  } catch {}
}

function kioskDeviceId() {
  const key='perpus-kiosk-device-id';
  let value=localStorage.getItem(key);
  if (!value) {
    value = `student-kiosk-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key,value);
  }
  return value;
}

function filterDemoBooks(q:string) {
  const needle=q.trim().toLowerCase();
  if (!needle) return demoBooks;
  return demoBooks.filter(b =>
    [b.title,b.author_text,b.category,b.shelf_code].some(v=>String(v||'').toLowerCase().includes(needle))
  );
}

export function PublicSearch() {
  const [q,setQ]=useState(''); const [books,setBooks]=useState<Book[]>([]); const [visits,setVisits]=useState(0);
  const [notice,setNotice]=useState(''); const [welcome,setWelcome]=useState<{name:string;className?:string}|null>(null);
  const [cameraOpen,setCameraOpen]=useState(false); const [previewMode,setPreviewMode]=useState(false);
  const lastActivity=useRef(Date.now());

  useEffect(()=>{
    const mark=()=>lastActivity.current=Date.now();
    ['mousemove','mousedown','keydown','touchstart','scroll'].forEach(x=>window.addEventListener(x,mark,{passive:true}));
    return ()=>['mousemove','mousedown','keydown','touchstart','scroll'].forEach(x=>window.removeEventListener(x,mark));
  },[]);

  useEffect(()=>{
    const t=setTimeout(async()=>{
      try {
        const result=await api<Book[]>(`/api/public/search?q=${encodeURIComponent(q)}`);
        setBooks(Array.isArray(result)?result:[]);
        setPreviewMode(false);
      } catch {
        setBooks(filterDemoBooks(q));
        setPreviewMode(true);
      }
    },180);
    return()=>clearTimeout(t);
  },[q]);

  useEffect(()=>{
    api<{count:number}>('/api/public/visit-count-today')
      .then(x=>setVisits(x.count))
      .catch(()=>{setVisits(127);setPreviewMode(true)});
  },[]);

  const onVisitScan=useCallback(async(code:string,source:VisitSource)=>{
    try {
      const idle=Date.now()-lastActivity.current>30000;
      const r=await api<{ok:boolean;duplicate:boolean;member:{name:string;className?:string}}>('/api/public/visit-scan',{
        method:'POST',
        body:JSON.stringify({code,deviceId:kioskDeviceId(),source})
      });
      beep(!r.duplicate); setVisits(v=>r.duplicate?v:v+1);
      if (idle) { setWelcome(r.member); setTimeout(()=>setWelcome(null),1800); }
      else { setNotice(r.duplicate?'Sudah tercatat sebelumnya':'✓ Absensi tercatat'); setTimeout(()=>setNotice(''),1200); }
      setQ(prev=>prev.replace(code,'').replace(`ABS:${code}`,'').trim());
    } catch {
      setPreviewMode(true);
      beep(true);
      setVisits(v=>v+1);
      setNotice(`✓ Kamera/scanner membaca ${code}. Mode preview: absensi disimulasikan.`);
      setTimeout(()=>setNotice(''),2200);
    }
  },[]);

  const onUsbScan=useCallback((code:string)=>{ void onVisitScan(code,'usb'); },[onVisitScan]);

  const onCameraScan=useCallback(async(code:string)=>{
    if (isMemberCode(code)) return onVisitScan(code,'camera');
    beep(true);
    setQ(code);
    setNotice(`✓ Kamera berhasil membaca barcode: ${code}`);
    setTimeout(()=>setNotice(''),2200);
  },[onVisitScan]);

  return <div className="public-page">
    <ScannerListener onScan={onUsbScan} accept={isMemberCode}/>
    <CameraScanner active={cameraOpen} onClose={()=>setCameraOpen(false)} onScan={onCameraScan} title="Scan Kartu / Uji Kamera"/>
    <header className="public-header">
      <div className="brand">📚 Perpustakaan Digital {previewMode&&<span className="demo-badge">Preview Demo</span>}</div>
      <Link className="admin-login" to="/admin/login">🔐 Pustakawan</Link>
    </header>
    {welcome && <div className="welcome-overlay"><div><b>Selamat datang</b><strong>{welcome.name}</strong><span>{welcome.className||''}</span></div></div>}
    {notice && <div className="toast">{notice}</div>}
    <section className="hero">
      <h1>Temukan Buku</h1><p>Cari judul, penulis, ISBN, kategori, atau lokasi rak.</p>
      <div className="searchbox"><span>🔎</span><input value={q} onChange={e=>setQ(e.target.value)} autoFocus placeholder="Contoh: Bahasa Arab Kelas XI"/></div>
      <div className="kiosk-tools">
        <small>Scan kartu anggota untuk mencatat kunjungan • Kunjungan hari ini: <b>{visits}</b></small>
        <button type="button" className="camera-button" onClick={()=>setCameraOpen(true)}>📷 Scan / uji kamera</button>
      </div>
      {previewMode&&<div className="demo-help">Mode preview tanpa PostgreSQL aktif. Pencarian memakai data contoh. Untuk uji kamera, arahkan ke barcode apa saja; barcode non-kartu akan dimasukkan ke kolom pencarian.</div>}
    </section>
    <section className="book-grid">
      {books.map(b=><article className="book-card" key={b.id}>
        <div className="cover">{b.cover_url?<img src={b.cover_url} alt=""/>:<span>📖</span>}</div>
        <div className="book-info"><h3>{b.title}</h3><p>{b.author_text||'Penulis belum diisi'}</p><div className="meta">{b.category&&<span>{b.category}</span>}{b.shelf_code&&<span>Rak {b.shelf_code}</span>}</div>
          <div className={`stock ${b.available>1?'ok':b.available===1?'low':'none'}`}>{b.available>0?`${b.available} tersedia dari ${b.total}`:'Sedang tidak tersedia'}</div>
        </div>
      </article>)}
      {!books.length && <div className="empty">Belum ada buku yang cocok.</div>}
    </section>
  </div>;
}
