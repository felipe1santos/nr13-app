import { Navigate, Outlet } from 'react-router-dom';
import { isAdmin } from '../services/auth';

// Bloqueia o admin de abrir as telas do sistema: admin só enxerga o painel /admin.
// Usuários comuns seguem para o sistema normalmente.
export default function RotaUsuario() {
  if (isAdmin()) return <Navigate to="/admin" replace />;
  return <Outlet />;
}
