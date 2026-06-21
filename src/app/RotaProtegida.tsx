import { Outlet } from 'react-router-dom';

// Login desativado temporariamente p/ testes. Reativar: voltar checagem usuarioLogado().
export default function RotaProtegida() {
  return <Outlet />;
}
