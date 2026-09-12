import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api';

export function AdminLayout() {
  const nav = useNavigate();
  const logout = async () => { await api('/api/auth/logout',{method:'POST'}); nav('/admin/login'); };
  return <div className="admin-shell">
    <aside className="sidebar">
      <div className="brand small">📚 Perpustakaan</div>
      <NavLink to="/admin">Dashboard</NavLink>
      <NavLink to="/admin/sirkulasi">Pinjam & Kembali</NavLink>
      <NavLink to="/admin/buku">Buku</NavLink>
      <NavLink to="/admin/import">Import Excel</NavLink>
      <NavLink to="/">Katalog Publik</NavLink>
      <button className="link-button" onClick={logout}>Keluar</button>
    </aside>
    <main className="admin-main"><Outlet /></main>
  </div>;
}
