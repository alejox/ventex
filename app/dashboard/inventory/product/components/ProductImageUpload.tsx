import Image from "next/image";

interface ProductImageUploadProps {
  imagePreview: string;
  dragOver: boolean;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onReset: () => void;
}

export function ProductImageUpload({
  imagePreview,
  dragOver,
  onImageChange,
  onDragOver,
  onDragLeave,
  onDrop,
  onReset,
}: ProductImageUploadProps) {
  return (
    <div className="bg-surface-container rounded-2xl sm:rounded-3xl border border-outline-variant/10 shadow-sm p-4 sm:p-8 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-on-surface mb-1">Imagen del Producto</h2>
        <p className="text-sm text-on-surface-variant">Sube una foto para identificar el producto visualmente</p>
      </div>

      {imagePreview ? (
        <div className="flex items-center gap-6">
          <div className="relative w-28 h-28 rounded-2xl overflow-hidden border border-outline-variant/20 bg-surface-container-lowest shrink-0">
            <Image src={imagePreview} alt="Vista previa" fill sizes="112px" unoptimized className="object-cover" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-on-surface">Imagen cargada</p>
            <button type="button" onClick={onReset} className="text-sm font-medium text-error hover:text-error-dim transition-colors">
              Quitar imagen
            </button>
          </div>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center gap-3 w-full py-10 rounded-2xl border-2 border-dashed bg-surface-container-lowest text-on-surface-variant cursor-pointer transition-all ${
            dragOver ? "border-primary bg-primary/5" : "border-outline-variant/30 hover:border-primary/50 hover:text-on-surface hover:bg-surface-container-lowest/80"
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <svg fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-8 h-8">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <div className="text-center">
            <p className="text-sm font-medium sm:hidden">Toca para tomar la foto del producto</p>
            <p className="text-sm font-medium hidden sm:block">Arrastra una imagen o haz clic para subir</p>
            <p className="text-xs text-on-surface-variant/60 mt-1">Se optimiza a WebP antes de subirla</p>
          </div>
          <input type="file" accept="image/*" capture="environment" onChange={onImageChange} className="hidden" />
        </label>
      )}
    </div>
  );
}
