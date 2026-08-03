import { useState } from 'react';
import { FileText, CreditCard, BarChart3, Users } from 'lucide-react';
import { UserProfile } from '../lib/types';
import PayablesTab from './advanced-finance/PayablesTab';
import ReceivablesTab from './advanced-finance/ReceivablesTab';
import CashFlowTab from './advanced-finance/CashFlowTab';
import TechnicianPerformanceTab from './advanced-finance/TechnicianPerformanceTab';

interface AdvancedFinanceProps {
  profile: UserProfile | null;
}

export default function AdvancedFinance({ profile }: AdvancedFinanceProps) {
  const [activeTab, setActiveTab] = useState<'receivables' | 'payables' | 'cashflow' | 'performance'>('receivables');

  const tabs = [
    { id: 'receivables', label: 'Contas a Receber', icon: FileText, allowed: ['admin', 'financeiro'] },
    { id: 'payables', label: 'Contas a Pagar', icon: CreditCard, allowed: ['admin', 'financeiro'] },
    { id: 'cashflow', label: 'Fluxo de Caixa', icon: BarChart3, allowed: ['admin', 'financeiro'] },
    { id: 'performance', label: 'Desempenho Técnico', icon: Users, allowed: ['admin'] },
  ];

  const visibleTabs = tabs.filter(t => t.allowed.includes(profile?.role ?? ''));

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex gap-2 overflow-x-auto">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 py-2 px-4 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'receivables' && <ReceivablesTab />}
        {activeTab === 'payables' && <PayablesTab />}
        {activeTab === 'cashflow' && <CashFlowTab />}
        {activeTab === 'performance' && profile?.role === 'admin' && <TechnicianPerformanceTab />}
      </div>
    </div>
  );
}
