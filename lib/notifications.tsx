import { toast } from "sonner";
import { CheckCircle2, X, AlertTriangle } from "lucide-react";

export const notifySuccess = (title: string, description?: string) => {
  toast.custom((t) => (
    <div className="flex w-[356px] items-start gap-3 rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] p-4 shadow-lg">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#059669]" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        )}
      </div>
      <button
        onClick={() => toast.dismiss(t)}
        className="ml-auto inline-flex shrink-0 text-gray-400 hover:text-gray-500 focus:outline-none"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  ), {
    duration: 4000,
  });
};

export const notifyError = (title: string, description?: string) => {
  toast.custom((t) => (
    <div className="flex w-[356px] items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 shadow-lg">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        )}
      </div>
      <button
        onClick={() => toast.dismiss(t)}
        className="ml-auto inline-flex shrink-0 text-gray-400 hover:text-gray-500 focus:outline-none"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  ), {
    duration: 4000,
  });
};
