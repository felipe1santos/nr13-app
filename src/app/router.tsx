import { Navigate, createBrowserRouter } from 'react-router-dom';
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import Equipamentos from '../pages/Equipamentos';
import Vencimentos from '../pages/Vencimentos';
import LivroRegistro from '../pages/LivroRegistro';
import Equipamento from '../pages/Equipamento';
import Memorial from '../pages/Memorial';
import Relatorios from '../pages/Relatorios';
import Inspecoes from '../pages/Inspecoes';
import InspecaoContainer from '../pages/InspecaoContainer';
import InspecaoFormulario from '../pages/InspecaoFormulario';
import Prontuarios from '../pages/Prontuarios';
import Calibracoes from '../pages/Calibracoes';
import MinhaEmpresa from '../pages/MinhaEmpresa';
import Empresas from '../pages/Empresas';
import Funcionarios from '../pages/Funcionarios';
import Admin from '../pages/Admin';
import Acesso from '../pages/Acesso';
import PortalLayout from '../pages/portal/PortalLayout';
import PortalAtivos from '../pages/portal/PortalAtivos';
import PortalAtivo from '../pages/portal/PortalAtivo';
import RotaProtegida from './RotaProtegida';
import RotaAdmin from './RotaAdmin';
import RotaUsuario from './RotaUsuario';
import RotaCliente from './RotaCliente';
import Layout from './Layout';
import RotaErro from './RotaErro';

export const router = createBrowserRouter([
  {
    errorElement: <RotaErro />,
    children: [
      { path: '/login', element: <Login /> },
      {
        element: <RotaProtegida />,
        children: [
          // Painel admin: standalone, FORA do Layout (sem barra do sistema). Só admin entra.
          {
            element: <RotaAdmin />,
            children: [{ path: '/admin', element: <Admin /> }],
          },
          // Portal do cliente: árvore própria, FORA do Layout do sistema (somente leitura).
          {
            element: <RotaCliente />,
            children: [
              {
                element: <PortalLayout />,
                children: [
                  { path: '/portal', element: <PortalAtivos /> },
                  { path: '/portal/ativo/:tag', element: <PortalAtivo /> },
                ],
              },
            ],
          },
          // Sistema: telas normais. Admin é redirecionado para /admin (não vê o sistema).
          {
            element: <RotaUsuario />,
            children: [
              {
                element: <Layout />,
                children: [
                  { path: '/', element: <Navigate to="/dashboard" replace /> },
                  { path: '/dashboard', element: <Dashboard /> },
                  { path: '/equipamentos', element: <Equipamentos /> },
                  { path: '/vencimentos', element: <Vencimentos /> },
                  { path: '/livro-registro', element: <LivroRegistro /> },
                  { path: '/equipamento/:tag', element: <Equipamento /> },
                  { path: '/equipamento/:tag/memorial', element: <Memorial /> },
                  { path: '/relatorios', element: <Relatorios /> },
                  { path: '/inspecoes', element: <Inspecoes /> },
                  { path: '/inspecoes/:tag/:containerId', element: <InspecaoContainer /> },
                  { path: '/inspecoes/:tag/:containerId/:formulario', element: <InspecaoFormulario /> },
                  { path: '/prontuarios', element: <Prontuarios /> },
                  { path: '/calibracoes', element: <Calibracoes /> },
                  { path: '/minha-empresa', element: <MinhaEmpresa /> },
                  { path: '/empresas', element: <Empresas /> },
                  { path: '/funcionarios', element: <Funcionarios /> },
                  { path: '/acesso', element: <Acesso /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
