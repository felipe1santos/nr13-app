import { Navigate, Outlet } from 'react-router-dom';
import { isAdmin } from '../services/auth';

// Guard de admin: só o administrador acessa /admin. Demais usuários vão pro dashboard.
export default function RotaAdmin() {
  if (!isAdmin()) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
