import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PublicSearch } from './pages/PublicSearch';
import { AdminLogin } from './pages/AdminLogin';
import { AdminLayout } from './components/AdminLayout';
import { AdminDashboard } from './pages/AdminDashboard';
import { Circulation } from './pages/Circulation';
import { Books } from './pages/Books';
import { ImportExcel } from './pages/ImportExcel';

export default function App(){return <BrowserRouter><Routes>
  <Route path="/" element={<PublicSearch/>}/>
  <Route path="/admin/login" element={<AdminLogin/>}/>
  <Route path="/admin" element={<AdminLayout/>}>
    <Route index element={<AdminDashboard/>}/>
    <Route path="sirkulasi" element={<Circulation/>}/>
    <Route path="buku" element={<Books/>}/>
    <Route path="import" element={<ImportExcel/>}/>
  </Route>
  <Route path="*" element={<Navigate to="/" replace/>}/>
</Routes></BrowserRouter>}
