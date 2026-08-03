import React, { useState } from 'react';
import { Loader2, Upload, Wrench, MapPin } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth';
import LoginPage from './components/LoginPage';
import TechnicianView from './components/TechnicianView';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CustomerList from './components/CustomerList';
import CustomerProfile from './components/CustomerProfile';
import AddContactModal from './components/AddContactModal';
import AddCustomerModal from './components/AddCustomerModal';
import ImportModal from './components/ImportModal';
import SchedulePage from './components/SchedulePage';
import Reports from './components/Reports';
import LogisticsPage from './components/LogisticsPage';
import TeamPage from './components/TeamPage';
import BackupPage from './components/BackupPage';
import WorkshopPage from './components/WorkshopPage';
import WorkshopOrderView from './components/WorkshopOrderView';
import FinancePage from './components/FinancePage';
import ConfigPage from './components/ConfigPage';
import PartsServicesPage from './components/PartsServicesPage';
import TechnicianOSView from './components/TechnicianOSView';
import UsedSalesPage from './components/UsedSalesPage';
import PublicEquipmentView from './components/PublicEquipmentView';
import { Customer } from './lib/types';

type Page = 'dashboard' | 'customers' | 'schedule' | 'reports' | 'logistics' | 'team' | 'backup' | 'workshop' | 'finance' | 'config' | 'parts';

function AppContent() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={32} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  const params = new URLSearchParams(window.location.search);
  const publicEquipId = params.get('publicEquipmentId');
  if (publicEquipId) {
    return <PublicEquipmentView equipmentId={publicEquipId} />;
  }

  if (!user) return <LoginPage />;

  if (profile?.role === 'technician' || profile?.role === 'comercial') return <TechnicianApp />;

  return <AdminApp />;
}

function TechnicianApp() {
  const { profile } = useAuth();
  const [techView, setTechView] = useState<'os' | 'routes'>('os');

  // Comercial profile: logistics/routes only
  if (profile?.role === 'comercial') {
    return <TechnicianView />;
  }

  // Technician profile: OS + Routes with bottom nav
  return (
    <div className="relative">
      {techView === 'os'     && <TechnicianOSView />}
      {techView === 'routes' && <TechnicianView />}
      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 flex shadow-lg">
        <button onClick={() => setTechView('os')}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-semibold transition-colors ${techView === 'os' ? 'text-amber-600' : 'text-slate-400'}`}>
          <Wrench size={20} />
          Ordens de Serviço
        </button>
        <button onClick={() => setTechView('routes')}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-semibold transition-colors ${techView === 'routes' ? 'text-amber-600' : 'text-slate-400'}`}>
          <MapPin size={20} />
          Rotas
        </button>
      </div>
    </div>
  );
}

function AdminApp() {
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [addContactForId, setAddContactForId] = useState<string | null>(null);
  const [addContactCustomerName, setAddContactCustomerName] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [workshopOrderId, setWorkshopOrderId] = useState<string | null>(null);

  function triggerRefresh() { setRefresh(r => r + 1); }

  function handleSelectCustomer(id: string) {
    setSelectedCustomerId(id);
    setPage('customers');
  }

  function handleAddContact(customerId: string, customerName = '') {
    setAddContactForId(customerId);
    setAddContactCustomerName(customerName);
  }

  function handleEditCustomer(customer: Customer) {
    setEditingCustomer(customer);
    setShowAddCustomer(true);
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        currentPage={page}
        onNavigate={(p) => { setPage(p); if (p !== 'customers') setSelectedCustomerId(null); if (p !== 'workshop') setWorkshopOrderId(null); }}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {page === 'customers' && !selectedCustomerId && (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 sm:px-6 py-4 bg-white border-b border-slate-200">
              <button className="lg:hidden text-slate-500" onClick={() => setSidebarOpen(true)}>
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-slate-800 flex-1">Clientes</h1>
              <div className="flex gap-2">
                <button onClick={() => setShowImport(true)}
                  className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm transition-colors">
                  <Upload size={14} /><span className="hidden sm:inline">Importar</span>
                </button>
                <button onClick={() => { setEditingCustomer(null); setShowAddCustomer(true); }}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="hidden sm:inline">Novo Cliente</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <CustomerList
                onSelectCustomer={handleSelectCustomer}
                onAddCustomer={() => { setEditingCustomer(null); setShowAddCustomer(true); }}
                onMenuClick={() => setSidebarOpen(true)}
                refresh={refresh}
              />
            </div>
          </div>
        )}

        {page === 'customers' && selectedCustomerId && (
          <CustomerProfile
            customerId={selectedCustomerId}
            onBack={() => setSelectedCustomerId(null)}
            onAddContact={(id) => handleAddContact(id)}
            onEditCustomer={handleEditCustomer}
            onMenuClick={() => setSidebarOpen(true)}
            refresh={refresh}
          />
        )}

        {page === 'dashboard' && (
          <Dashboard
            onNavigate={(p) => { setPage(p as Page); }}
            onSelectCustomer={handleSelectCustomer}
            onMenuClick={() => setSidebarOpen(true)}
            refresh={refresh}
          />
        )}

        {page === 'schedule' && (
          <SchedulePage
            onSelectCustomer={handleSelectCustomer}
            onMenuClick={() => setSidebarOpen(true)}
            refresh={refresh}
          />
        )}

        {page === 'reports' && (
          <Reports onMenuClick={() => setSidebarOpen(true)} refresh={refresh} />
        )}

        {page === 'logistics' && (
          <LogisticsPage
            onMenuClick={() => setSidebarOpen(true)}
            onSelectCustomer={handleSelectCustomer}
            refresh={refresh}
          />
        )}

        {page === 'team' && (
          <TeamPage onMenuClick={() => setSidebarOpen(true)} />
        )}

        {page === 'backup' && (
          <BackupPage onMenuClick={() => setSidebarOpen(true)} />
        )}

        {page === 'workshop' && !workshopOrderId && (
          <WorkshopPage
            onMenuClick={() => setSidebarOpen(true)}
            onSelectOrder={(id) => setWorkshopOrderId(id)}
            onNewOrder={() => setWorkshopOrderId('new')}
            refresh={refresh}
          />
        )}

        {page === 'workshop' && workshopOrderId && (
          <WorkshopOrderView
            orderId={workshopOrderId}
            onBack={() => setWorkshopOrderId(null)}
            onMenuClick={() => setSidebarOpen(true)}
            onSelectCustomer={handleSelectCustomer}
          />
        )}

        {page === 'finance' && (
          <FinancePage onMenuClick={() => setSidebarOpen(true)} refresh={refresh} />
        )}

        {page === 'sales' && (
          <UsedSalesPage onMenuClick={() => setSidebarOpen(true)} />
        )}

        {page === 'config' && (
          <ConfigPage onMenuClick={() => setSidebarOpen(true)} />
        )}

        {page === 'parts' && (
          <PartsServicesPage onMenuClick={() => setSidebarOpen(true)} refresh={refresh} />
        )}
      </main>

      {showAddCustomer && (
        <AddCustomerModal
          customer={editingCustomer}
          onClose={() => { setShowAddCustomer(false); setEditingCustomer(null); }}
          onSuccess={triggerRefresh}
        />
      )}

      {addContactForId && (
        <AddContactModal
          customerId={addContactForId}
          customerName={addContactCustomerName}
          onClose={() => setAddContactForId(null)}
          onSuccess={triggerRefresh}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={triggerRefresh}
        />
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null, info: any}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: any) { this.setState({ error, info }); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', fontFamily: 'sans-serif' }}>
          <h2>Erro no Aplicativo</h2>
          <p>{this.state.error?.toString()}</p>
          <pre style={{ fontSize: 11, background: '#f0f0f0', padding: 10, overflow: 'auto' }}>
            {this.state.info?.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
