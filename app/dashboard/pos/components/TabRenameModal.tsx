interface TabRenameModalProps {
  renameValue: string;
  setRenameValue: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function TabRenameModal({ renameValue, setRenameValue, onSubmit, onClose }: TabRenameModalProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="bg-surface-container-lowest rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200"
      >
        <h2 className="text-lg font-bold text-on-surface">Renombrar venta</h2>
        <input
          autoFocus
          type="text"
          value={renameValue}
          maxLength={40}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder="Ej. Mesa 4, Juan, Pedido 12"
          className="w-full h-12 bg-surface-container border border-outline-variant/20 rounded-xl px-4 text-base text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!renameValue.trim()}
            className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dim transition-colors disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
