import { 
  IconSearch, 
  IconBox,
} from "@/app/assets/icons/DashboardIcons";

function IconAlertTriangle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20" {...props}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconImagePlaceholder(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="24" height="24" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function IconLayers(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20" {...props}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 12 12 17 22 12" />
      <polyline points="2 17 12 22 22 17" />
    </svg>
  );
}

function IconFilter(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20" {...props}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function IconMoreHorizontal(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20" {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

export default function InventoryPage() {
  const inventory = [
    { id: 1, name: "Nimbus Smart Watch V2", category: "Electrónica", sku: "NTM-SW-002", price: 209.00, stock: "Óptimo (120)", stockStatus: "optimal" },
    { id: 2, name: "Aura Over-Ear Headphones", category: "Electrónica", sku: "AUR-OE-001", price: 149.50, stock: "Stock Bajo (8)", stockStatus: "low" },
    { id: 3, name: "Velocity Running Shoe (Red)", category: "Ropa", sku: "VEL-RS-R42", price: 120.00, stock: "Agotado (0)", stockStatus: "out" },
    { id: 4, name: "Minimalist Desk Lamp", category: "Hogar y Oficina", sku: "MIN-DL-WHT", price: 45.00, stock: "Óptimo (320)", stockStatus: "optimal" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-on-surface">Gestión de Inventario</h1>
        <button className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2">
          <span>+</span> Nuevo Producto
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm flex justify-between items-center group">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1">SKU Totales</p>
            <h3 className="text-3xl font-bold text-on-surface">1,248</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconBox className="w-6 h-6" />
          </div>
        </div>
        
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm flex justify-between items-center group">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1">Valor del Inventario</p>
            <h3 className="text-3xl font-bold text-on-surface">$84,500.00</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#8b5cf6]/10 text-[#8b5cf6] flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconLayers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-error-container/10 rounded-2xl p-5 border border-error-container/30 shadow-sm flex justify-between items-center group">
          <div>
            <p className="text-error-dim text-sm font-medium mb-1">Stock Bajo</p>
            <h3 className="text-3xl font-bold text-error">12</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-error/10 text-error flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconAlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden flex flex-col">
        {/* Filters */}
        <div className="p-5 border-b border-outline-variant/10 flex flex-col md:flex-row gap-4 items-center justify-between bg-surface-container-lowest">
          <div className="relative w-full md:w-96">
            <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input 
              type="text" 
              placeholder="Buscar productos, SKUs..." 
              className="w-full bg-surface-container border border-outline-variant/20 rounded-xl py-2 pl-11 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
            />
          </div>
          <div className="flex w-full md:w-auto gap-3">
            <select className="bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-2 text-sm text-on-surface focus:outline-none focus:border-primary flex-1 md:w-40 appearance-none">
              <option>Todas las Categorías</option>
              <option>Electrónica</option>
              <option>Ropa</option>
            </select>
            <select className="bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-2 text-sm text-on-surface focus:outline-none focus:border-primary flex-1 md:w-36 appearance-none">
              <option>Estado de Stock</option>
              <option>Óptimo</option>
              <option>Stock Bajo</option>
              <option>Agotado</option>
            </select>
            <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0">
              <IconFilter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
                <th className="p-4 pl-6 font-bold">Imagen</th>
                <th className="p-4 font-bold">Nombre del Producto</th>
                <th className="p-4 font-bold">Categoría</th>
                <th className="p-4 font-bold">SKU</th>
                <th className="p-4 font-bold">Precio</th>
                <th className="p-4 font-bold">Nivel de Stock</th>
                <th className="p-4 pr-6 text-center font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5 text-sm">
              {inventory.map((item) => (
                <tr key={item.id} className="hover:bg-surface-container-lowest transition-colors group">
                  <td className="p-4 pl-6">
                    <div className="w-10 h-10 rounded-lg bg-surface-container border border-outline-variant/10 flex items-center justify-center text-on-surface-variant/30">
                       <IconImagePlaceholder className="w-5 h-5" />
                    </div>
                  </td>
                  <td className="p-4 font-medium text-on-surface">{item.name}</td>
                  <td className="p-4 text-on-surface-variant">{item.category}</td>
                  <td className="p-4 text-on-surface-variant font-mono text-xs">{item.sku}</td>
                  <td className="p-4 text-on-surface font-semibold">${item.price.toFixed(2)}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                      item.stockStatus === 'optimal' ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' :
                      item.stockStatus === 'low' ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20' :
                      'bg-error-container/20 text-error-dim border border-error-container/30'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        item.stockStatus === 'optimal' ? 'bg-[#10b981]' :
                        item.stockStatus === 'low' ? 'bg-[#f59e0b]' :
                        'bg-error'
                      }`}></span>
                      {item.stock}
                    </span>
                  </td>
                  <td className="p-4 pr-6 text-center">
                    <button className="text-on-surface-variant hover:text-primary transition-colors p-1">
                      <IconMoreHorizontal className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer & Pagination */}
        <div className="p-5 border-t border-outline-variant/10 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-lowest">
          <p className="text-xs text-on-surface-variant font-medium">Mostrando 1 a 4 de 1,248 registros</p>
          <div className="flex gap-1 items-center">
            <button className="px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors border border-transparent hover:border-outline-variant/10">Anterior</button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-white hover:text-[#0b0664] text-xs font-bold shadow-md shadow-primary/20">1</button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface text-xs font-bold transition-colors">2</button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface text-xs font-bold transition-colors">3</button>
            <span className="text-on-surface-variant px-1">...</span>
            <button className="px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors border border-transparent hover:border-outline-variant/10">Siguiente</button>
          </div>
        </div>
      </div>
    </div>
  );
}
