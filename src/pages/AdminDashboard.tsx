import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

type Stats={titles:number;copies:number;available:number;borrowed:number;overdue:number;members:number;visits_today:number};
export function AdminDashboard(){ const [s,setS]=useState<Stats|null>(null); useEffect(()=>{api<Stats>('/api/admin/stats').then(setS)},[]);
return <><div className="page-head"><h1>Dashboard</h1><p>Operasional perpustakaan hari ini.</p></div><div className="quick-actions"><Link to="/admin/sirkulasi">📥 Pinjam</Link><Link to="/admin/sirkulasi">📤 Kembali</Link><Link to="/admin/buku">📚 Buku</Link><Link to="/admin/import">📄 Import</Link></div>{s&&<div className="stats">{[['Judul',s.titles],['Eksemplar',s.copies],['Tersedia',s.available],['Dipinjam',s.borrowed],['Terlambat',s.overdue],['Anggota',s.members],['Kunjungan Hari Ini',s.visits_today]].map(([k,v])=><div className="stat" key={String(k)}><span>{k}</span><strong>{v}</strong></div>)}</div>}</>}
