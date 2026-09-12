import { FormEvent, useCallback, useRef, useState } from 'react';
import { api } from '../api';
import { CameraScanner } from '../components/CameraScanner';

type Member={member_code:string;name:string;class_name?:string;activeLoans:number;maxBooks:number};
type Copy={copy_code:string;status:string;title:string;author_text?:string;borrower_name?:string;due_at?:string};
type ScanSource='manual'|'camera';

const acceptLibraryCode=(code:string)=>/^(STU|TCH|BK)-\d{4}-\d{6}$/.test(code);

function beep(ok=true){
  try{
    const Ctx=window.AudioContext||(window as any).webkitAudioContext;
    const ctx=new Ctx();const osc=ctx.createOscillator();const gain=ctx.createGain();
    osc.frequency.value=ok?920:230;gain.gain.value=.07;osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+(ok?.08:.18));
  }catch{}
}

export function Circulation(){
  const [input,setInput]=useState('');
  const [member,setMember]=useState<Member|null>(null);
  const memberRef=useRef<Member|null>(null);
  const [items,setItems]=useState<Copy[]>([]);
  const [message,setMessage]=useState('');
  const [cameraOpen,setCameraOpen]=useState(false);
  const ref=useRef<HTMLInputElement>(null);

  const selectMember=(value:Member|null)=>{
    memberRef.current=value;
    setMember(value);
  };

  const processCode=useCallback(async(raw:string,source:ScanSource='manual')=>{
    const code=raw.trim().replace(/^(ABS|LIB):/i,'').toUpperCase();
    if(!code)return;
    setMessage('');
    try{
      if(code.startsWith('STU-')||code.startsWith('TCH-')){
        const m=await api<Member>(`/api/admin/member/${encodeURIComponent(code)}`);
        memberRef.current=m;setMember(m);setItems([]);setMessage(`Peminjam aktif: ${m.name}`);beep(true);
      } else if(code.startsWith('BK-')){
        const c=await api<Copy>(`/api/admin/copy/${encodeURIComponent(code)}`);
        const activeMember=memberRef.current;
        if(activeMember){
          if(c.status!=='available')throw new Error(`${c.title} tidak tersedia.`);
          setItems(current=>current.find(x=>x.copy_code===c.copy_code)?current:[...current,c]);
          setMessage(`✓ ${c.title} ditambahkan`);beep(true);
        } else {
          if(c.status!=='borrowed')throw new Error(`${c.title} tidak sedang dipinjam.`);
          const r=await api<any>('/api/admin/returns',{method:'POST',body:JSON.stringify({copyCode:code,scanSource:source})});
          setMessage(`✓ ${r.title} dikembalikan${r.lateDays?` • terlambat ${r.lateDays} hari`:''}`);beep(true);
        }
      } else throw new Error('Barcode tidak dikenali.');
    }catch(e:any){
      beep(false);setMessage(`⚠ ${e.message}`);
    }finally{
      setInput('');ref.current?.focus();
    }
  },[]);

  const onCameraScan=useCallback((code:string)=>processCode(code,'camera'),[processCode]);

  const scan=(e:FormEvent)=>{
    e.preventDefault();
    void processCode(input,'manual');
  };

  const finish=async()=>{
    if(!member||!items.length)return;
    try{
      const r=await api<any>('/api/admin/loans',{method:'POST',body:JSON.stringify({memberCode:member.member_code,copyCodes:items.map(x=>x.copy_code),scanSource:cameraOpen?'camera':'manual'})});
      setMessage(`✓ ${r.count} buku dipinjam. Jatuh tempo ${new Date(r.dueAt).toLocaleDateString('id-ID')}`);
      beep(true);selectMember(null);setItems([]);
    }catch(e:any){beep(false);setMessage(`⚠ ${e.message}`)}
    finally{ref.current?.focus()}
  };

  return <>
    <CameraScanner active={cameraOpen} onClose={()=>setCameraOpen(false)} onScan={onCameraScan} accept={acceptLibraryCode} title="Scanner Sirkulasi"/>
    <div className="page-head"><h1>Sirkulasi Cepat</h1><p>Scan kartu anggota untuk meminjam. Scan buku tanpa anggota aktif untuk mengembalikan.</p></div>
    <div className="scanner-toolbar">
      <span>USB scanner tetap dapat dipakai lewat kolom scan.</span>
      <button type="button" className="camera-button" onClick={()=>setCameraOpen(true)}>📷 Gunakan kamera</button>
    </div>
    <form className="scan-panel" onSubmit={scan}><input ref={ref} autoFocus value={input} onChange={e=>setInput(e.target.value)} placeholder="Scan / ketik STU-... / TCH-... / BK-..."/><button>Proses</button></form>
    {message&&<div className="info-box">{message}</div>}
    {member&&<div className="member-box"><strong>{member.name}</strong><span>{member.class_name||''}</span><span>Pinjaman aktif {member.activeLoans}/{member.maxBooks}</span></div>}
    <div className="loan-list">{items.map(x=><div key={x.copy_code}><span><b>{x.title}</b><small>{x.copy_code}</small></span><button onClick={()=>setItems(y=>y.filter(i=>i.copy_code!==x.copy_code))}>Hapus</button></div>)}</div>
    {member&&items.length>0&&<button className="primary big" onClick={finish}>Selesaikan Peminjaman ({items.length})</button>}
  </>
}
