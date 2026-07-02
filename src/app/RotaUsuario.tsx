import { Navigate, Outlet } from 'react-router-dom';
import { isAdmin, isCliente } from '../services/auth';

// Bloqueia o admin de abrir as telas do sistema: admin só enxerga o painel /admin.
// Contas de CLIENTE só enxergam o portal (/portal). Usuários comuns seguem normalmente.
export default function RotaUsuario() {
  if (isAdmin()) return <Navigate to="/admin" replace />;
  if (isCliente()) return <Navigate to="/portal" replace />;
  return <Outlet />;
}
