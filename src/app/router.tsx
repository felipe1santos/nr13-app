import { Navigate, createBrowserRouter } from 'react-router-dom';
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
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
import Admin from '../pages/Admin';
import RotaProtegida from './RotaProtegida';
import RotaAdmin from './RotaAdmin';
import Layout from './Layout';

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <RotaProtegida />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <Dashboard /> },
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
          {
            element: <RotaAdmin />,
            children: [{ path: '/admin', element: <Admin /> }],
          },
        ],
      },
    ],
  },
]);
