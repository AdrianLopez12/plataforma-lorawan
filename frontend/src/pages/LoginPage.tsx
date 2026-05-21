import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const getDemoPassword = (emailStr: string) => {
    try {
      const stored = localStorage.getItem('custom_users');
      if (stored) {
        const users = JSON.parse(stored);
        const u = users.find((x: any) => x.email.toLowerCase() === emailStr.toLowerCase());
        if (u) return u.password;
      }
    } catch (e) {
      // Ignore
    }
    return '123456';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const ok = await login(email, password);
    setLoading(false);
    if (ok) navigate('/dashboard');
    else setError('Correo o contraseña incorrectos');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <Radio size={28} className="text-teal-500" />
          </div>
          <h1 className="login-title">LoRaWAN Platform</h1>
          <p className="login-subtitle">Gestión de medidores de agua y SmartBins</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Correo electrónico</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <div className="login-demo">
          <div className="demo-title">Usuarios de prueba</div>
          <div className="demo-users">
            <div onClick={() => { setEmail('super@lorawan.com'); setPassword(getDemoPassword('super@lorawan.com')); }} className="demo-user">
              <span className="role-badge bg-purple-100 text-purple-800">superadmin</span>
              <span>super@lorawan.com</span>
            </div>
            <div onClick={() => { setEmail('admin@cliente.com'); setPassword(getDemoPassword('admin@cliente.com')); }} className="demo-user">
              <span className="role-badge bg-blue-100 text-blue-800">admin</span>
              <span>admin@cliente.com</span>
            </div>
            <div onClick={() => { setEmail('operador@cliente.com'); setPassword(getDemoPassword('operador@cliente.com')); }} className="demo-user">
              <span className="role-badge bg-gray-100 text-gray-700">operator</span>
              <span>operador@cliente.com</span>
            </div>
          </div>
          <div className="demo-pass">Contraseña: Autocompletada dinámicamente</div>
        </div>
      </div>
    </div>
  );
}
