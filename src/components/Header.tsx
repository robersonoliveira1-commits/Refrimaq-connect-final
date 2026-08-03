import { Menu, Bell } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuClick: () => void;
  actions?: React.ReactNode;
}

export default function Header({ title, subtitle, onMenuClick, actions }: HeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center gap-4">
      <button
        className="lg:hidden text-slate-500 hover:text-slate-700"
        onClick={onMenuClick}
      >
        <Menu size={22} />
      </button>

      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold text-slate-800 truncate">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 truncate">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        {actions}
        <button className="relative p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
          <Bell size={18} />
        </button>
      </div>
    </header>
  );
}
