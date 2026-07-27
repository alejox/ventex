interface SuccessModalProps {
  onPrint: () => void;
  onClose: () => void;
}

export function SuccessModal({ onPrint, onClose }: SuccessModalProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-[24px] w-full max-w-sm border border-outline-variant/10 shadow-2xl p-8 text-center animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-16 h-16 bg-[#10b981]/10 text-[#10b981] rounded-full flex items-center justify-center mx-auto mb-6">
          <svg fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-on-surface mb-2">&iexcl;Venta exitosa!</h2>
        <p className="text-sm text-on-surface-variant mb-8">
          El pago se ha procesado correctamente. &iquest;Deseas imprimir el recibo de esta venta?
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onPrint}
            className="w-full py-3 rounded-xl bg-[#6063ee] hover:bg-[#4f51c7] text-white font-bold transition-colors shadow-lg shadow-[#6063ee]/20 flex justify-center items-center gap-2"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z" />
              <line x1="16" y1="8" x2="8" y2="8" />
              <line x1="16" y1="12" x2="8" y2="12" />
              <line x1="10" y1="16" x2="8" y2="16" />
            </svg>
            Imprimir Recibo
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl border border-outline-variant/30 hover:bg-surface-container-low text-on-surface font-semibold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
