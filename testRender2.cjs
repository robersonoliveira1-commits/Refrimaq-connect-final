const React = require('react');
const { renderToString } = require('react-dom/server');
const CustomerProfile = require('./dist_test/CustomerProfile.js').default;

const mockCustomer = {"id":"1d1972c2-cfd7-4933-99e3-6e3098e9f181","name":"CKBR BEBIDAS LTDA","phone":"","whatsapp":"","email":"","address":"Avenida Presidente Humberto de Alencar Castelo Branco 2911","city":"Jacareí","state":"SP","zip_code":"12321150","document":"","notes":"","last_contact_at":null,"created_at":"2026-07-17T23:35:32.537779+00:00","updated_at":"2026-07-17T23:35:32.537779+00:00","latitude":-23.2921044,"longitude":-45.9798709,"equipment_types":[]};

try {
  // It fetches using supabase, so it will return empty arrays for orders, etc.
  // But wait, the crash happens in initial render OR after fetch?
  // If it's a white screen, it could be either.
  const element = React.createElement(CustomerProfile, {
    customerId: mockCustomer.id,
    onBack: () => {},
    onAddContact: () => {},
    onEditCustomer: () => {},
    onMenuClick: () => {},
    refresh: 0
  });
  renderToString(element);
  console.log("Render successful!");
} catch (e) {
  console.error("Render failed:", e);
}
