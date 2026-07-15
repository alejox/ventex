export const TEST_PRODUCT = {
  name: "Test Product E2E",
  sku: `TST-${Date.now()}`,
  price: "99.99",
  purchase_price: "50.00",
  stock_level: 100,
  minimum_stock: 10,
};

export const TEST_CUSTOMER = {
  full_name: "Test Customer E2E",
  email: `customer${Date.now()}@test.com`,
  phone: "555-0100",
  doc_type: "CC",
  identification: `1${Date.now()}`,
};

export const TEST_SERVICE = {
  name: "Test Service E2E",
  price: "49.99",
  duration_minutes: "45",
  description: "E2E test service",
};

export const TEST_STAFF = {
  full_name: "Test Staff E2E",
  role: "Barbero",
  commission_rate: "10",
  commission_type: "percentage",
};

export const TEST_DISTRIBUTOR = {
  business_name: "Test Distributor E2E",
  contact_name: "John Doe",
  phone: "555-0200",
  email: "dist@test.com",
};

export const TEST_CATEGORY = {
  name: `TestCat-${Date.now()}`,
  description: "E2E test category",
};
