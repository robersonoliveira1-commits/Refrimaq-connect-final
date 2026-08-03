import { LayoutDashboard, Users, BarChart3, Calendar, X, Map, UsersRound, LogOut, Database, Wrench, Banknote, Settings, Boxes, ShoppingCart } from 'lucide-react';
import { useAuth } from '../lib/auth';

type Page = 'dashboard' | 'customers' | 'schedule' | 'reports' | 'logistics' | 'team' | 'backup' | 'workshop' | 'sales' | 'finance' | 'config' | 'parts';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const navItems: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { page: 'dashboard', label: 'Painel',           icon: LayoutDashboard },
  { page: 'customers', label: 'Clientes',          icon: Users },
  { page: 'logistics', label: 'Logística',         icon: Map },
  { page: 'schedule',  label: 'Agendamentos',      icon: Calendar },
  { page: 'reports',   label: 'Relatórios',        icon: BarChart3 },
  { page: 'workshop',  label: 'Oficina',           icon: Wrench },
  { page: 'sales',     label: 'Venda de Usados',   icon: ShoppingCart },
  { page: 'parts',     label: 'Peças e Serviços',  icon: Boxes },
  { page: 'finance',   label: 'Financeiro',        icon: Banknote },
  { page: 'team',      label: 'Equipe',            icon: UsersRound },
  { page: 'backup',    label: 'Backup',            icon: Database },
  { page: 'config',    label: 'Configurações',     icon: Settings },
];

export default function Sidebar({ currentPage, onNavigate, mobileOpen, onMobileClose }: SidebarProps) {
  const { signOut, user } = useAuth();

  return (
    <>
      {/* mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-slate-900 text-white flex flex-col z-30
          transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
          <img src="/Refrimaq_Logomarca_-_modelo03.JPG" alt="Refrimaq" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
          <div>
            <p className="font-bold text-white leading-tight">Refrimaq</p>
            <p className="text-sky-400 text-xs font-semibold tracking-widest uppercase leading-tight">Connect</p>
          </div>
          <button
            className="ml-auto lg:hidden text-slate-400 hover:text-white"
            onClick={onMobileClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ page, label, icon: Icon }) => (
            <button
              key={page}
              onClick={() => { onNavigate(page); onMobileClose(); }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${currentPage === page
                  ? 'bg-amber-500 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'}
              `}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-700 space-y-3">
          {user && (
            <p className="text-slate-400 text-xs truncate px-2">{user.email}</p>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition-colors"
          >
            <LogOut size={18} />
            Sair
          </button>
          <p className="text-slate-500 text-xs px-2">Refrimaq Connect v1.0</p>
        </div>
      </aside>
    </>
  );
}
