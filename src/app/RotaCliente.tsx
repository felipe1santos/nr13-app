import { Navigate, Outlet } from 'react-router-dom';
import { isCliente } from '../services/auth';

// Portal do cliente: só contas papel='cliente' entram; os demais vão para o sistema.
export default function RotaCliente() {
  if (!isCliente()) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
