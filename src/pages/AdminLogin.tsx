import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export function AdminLogin(){ const nav=useNavigate(); const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState('');
  const submit=async(e:FormEvent)=>{e.preventDefault();setError('');try{await api('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});nav('/admin');}catch(e:any){setError(e.message)}};
  return <div className="login-page"><form className="login-card" onSubmit={submit}><h1>Login Pustakawan</h1><label>Username<input value={username} onChange={e=>setUsername(e.target.value)} autoFocus/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<div className="error">{error}</div>}<button>Masuk</button><LinkBack/></form></div>
}
function LinkBack(){ return <a className="back" href="/">← Kembali ke katalog</a> }
