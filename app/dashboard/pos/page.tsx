import { 
  IconSearch, 
  IconPlus, 
  IconUsers,
} from "@/app/assets/icons/DashboardIcons";
import Link from "next/link";

// Custom trash icon
function IconTrash(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

// Custom image placeholder icon
function IconImagePlaceholder(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="24" height="24" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

export default function POSPage() {
  const categories = ["Todos", "Electrónica", "Ropa", "Hogar y Oficina", "Accesorios", "Ofertas"];
  
  const products = [
    { id: 1, name: "Aura Pro Noise Cancelling...", sku: "AU-1029", price: 249.99 },
    { id: 2, name: "Vanguard Smartwatch", sku: "WC-5531", price: 199.50 },
    { id: 3, name: "Echo Pods True Wireless", sku: "AU-0020", price: 89.00 },
    { id: 4, name: "Leather Laptop Sleeve 15\"", sku: "AC-1002", price: 45.00 },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)] -mt-4">
      {/* Left Area: Catalog */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search Bar */}
        <div className="relative mb-6">
          <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input 
            type="text" 
            placeholder="Buscar por nombre, SKU, o escanear código..." 
            className="w-full bg-surface-container rounded-2xl py-3.5 pl-11 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 border border-outline-variant/10 shadow-sm"
          />
        </div>

        {/* Quick Actions (Mobile mimicking Dashboard) */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button className="col-span-2 bg-[#6063ee] text-white rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-[#6063ee]/20 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <IconPlus className="w-5 h-5" />
              </div>
              <span className="font-bold">Nueva Venta</span>
            </div>
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
          
          <Link href="/dashboard/customers/new" className="bg-surface-container rounded-2xl p-4 border border-outline-variant/10 flex flex-col gap-3 shadow-sm hover:border-primary transition-colors">
            <IconUsers className="w-6 h-6 text-emerald-500" />
            <span className="text-sm font-bold text-on-surface">Añadir Cliente</span>
          </Link>
          
          <div className="bg-surface-container rounded-2xl p-4 border border-outline-variant/10 flex flex-col gap-3 shadow-sm hover:border-error transition-colors cursor-pointer">
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="24" height="24" className="text-error"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span className="text-sm font-bold text-on-surface">Stock Alert</span>
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
          {categories.map((cat, i) => (
            <button 
              key={i} 
              className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-medium transition-colors ${
                i === 0 
                  ? "bg-[#6063ee] text-white hover:text-[#0b0664]" 
                  : "bg-surface-container border border-outline-variant/10 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto pb-6 pr-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map((product) => (
              <div key={product.id} className="bg-surface-container rounded-2xl p-3 border border-outline-variant/10 flex flex-col hover:border-primary/30 transition-colors group cursor-pointer shadow-sm">
                <div className="aspect-square rounded-xl bg-surface-container-lowest flex items-center justify-center mb-3 group-hover:bg-surface-container-low transition-colors relative overflow-hidden">
                  <IconImagePlaceholder className="w-8 h-8 text-on-surface-variant/30" />
                  <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors"></div>
                </div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">SKU: {product.sku}</p>
                <h3 className="text-sm font-medium text-on-surface mb-2 line-clamp-2 leading-tight flex-1 group-hover:text-primary transition-colors">{product.name}</h3>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-[#6063ee] font-bold">${product.price.toFixed(2)}</span>
                  <button className="w-8 h-8 rounded-full bg-[#6063ee]/10 text-[#6063ee] flex items-center justify-center hover:bg-[#6063ee] hover:text-[#0b0664] transition-colors group-hover:scale-110">
                    <IconPlus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Area: Current Order */}
      <div className="w-full lg:w-[380px] bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm flex flex-col h-full overflow-hidden shrink-0">
        {/* Order Header */}
        <div className="p-5 border-b border-outline-variant/10 flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Orden Actual</h2>
            <p className="text-xs text-on-surface-variant mt-1">Cliente: De Paso</p>
          </div>
          <span className="bg-surface-container-high text-on-surface-variant text-xs font-bold px-2 py-1 rounded-md">#TX-3829</span>
        </div>

        {/* Order Items */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Item 1 */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-start gap-2">
              <div>
                <h4 className="text-sm font-medium text-on-surface line-clamp-1">Aura Pro Noise Cancelling...</h4>
                <p className="text-[10px] text-on-surface-variant mt-0.5 uppercase tracking-wide">SKU: AU-1029</p>
              </div>
              <span className="text-sm font-bold text-on-surface shrink-0">$249.99</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center border border-outline-variant/20 rounded-lg overflow-hidden bg-surface-container-lowest">
                <button className="w-8 h-7 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors">-</button>
                <span className="w-8 text-center text-xs font-medium text-on-surface">1</span>
                <button className="w-8 h-7 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors">+</button>
              </div>
              <button className="text-error/70 hover:text-error transition-colors p-1">
                <IconTrash className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="w-full h-px bg-outline-variant/5"></div>

          {/* Item 2 */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-start gap-2">
              <div>
                <h4 className="text-sm font-medium text-on-surface line-clamp-1">Leather Laptop Sleeve 15"</h4>
                <p className="text-[10px] text-on-surface-variant mt-0.5 uppercase tracking-wide">SKU: AC-1002</p>
              </div>
              <span className="text-sm font-bold text-on-surface shrink-0">$45.00</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center border border-outline-variant/20 rounded-lg overflow-hidden bg-surface-container-lowest">
                <button className="w-8 h-7 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors">-</button>
                <span className="w-8 text-center text-xs font-medium text-on-surface">1</span>
                <button className="w-8 h-7 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors">+</button>
              </div>
              <button className="text-error/70 hover:text-error transition-colors p-1">
                <IconTrash className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="p-5 border-t border-outline-variant/10 bg-surface-container-lowest mt-auto">
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Subtotal</span>
              <span className="text-on-surface font-medium">$294.99</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Impuesto (16%)</span>
              <span className="text-on-surface font-medium">$47.20</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Descuento</span>
              <span className="text-[#10b981] font-medium">-$0.00</span>
            </div>
          </div>
          
          <div className="flex justify-between items-center mb-6 pt-4 border-t border-outline-variant/10">
            <span className="text-lg font-bold text-on-surface">Total</span>
            <span className="text-3xl font-black text-[#6063ee]">$342.19</span>
          </div>

          <button className="w-full bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] font-bold rounded-xl py-3.5 mb-3 transition-colors shadow-lg shadow-[#6063ee]/20 flex items-center justify-center gap-2">
            Proceder al Pago
          </button>
          
          <div className="flex gap-3">
            <button className="flex-1 bg-surface-container border border-outline-variant/20 hover:bg-surface-container-high text-on-surface text-sm font-semibold rounded-xl py-2.5 transition-colors">
              Pausar Orden
            </button>
            <button className="flex-1 bg-error-container/20 border border-error-container/30 hover:bg-error-container/40 text-error-dim text-sm font-semibold rounded-xl py-2.5 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
