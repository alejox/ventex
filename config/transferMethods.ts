export interface TransferMethodOption {
  id: string;
  name: string;
  shortName: string;
  color: string; // Brand color or background accent
  bgColor: string; // Tailored badge background
  borderColor: string;
  badgeText?: string;
}

export const COLOMBIA_TRANSFER_METHODS: TransferMethodOption[] = [
  {
    id: "nequi",
    name: "Nequi",
    shortName: "Nequi",
    color: "#240046",
    bgColor: "bg-purple-500/10 dark:bg-purple-500/20",
    borderColor: "border-purple-500/30",
    badgeText: "Nequi",
  },
  {
    id: "daviplata",
    name: "Daviplata",
    shortName: "Daviplata",
    color: "#e63946",
    bgColor: "bg-red-500/10 dark:bg-red-500/20",
    borderColor: "border-red-500/30",
    badgeText: "Daviplata",
  },
  {
    id: "bancolombia",
    name: "Bancolombia / QR",
    shortName: "Bancolombia",
    color: "#fdc500",
    bgColor: "bg-amber-500/10 dark:bg-amber-500/20",
    borderColor: "border-amber-500/30",
    badgeText: "Bancolombia",
  },
  {
    id: "transfiya",
    name: "Transfiya / Bre-B",
    shortName: "Transfiya",
    color: "#00b4d8",
    bgColor: "bg-cyan-500/10 dark:bg-cyan-500/20",
    borderColor: "border-cyan-500/30",
    badgeText: "Transfiya",
  },
  {
    id: "pse",
    name: "PSE / Débito",
    shortName: "PSE",
    color: "#003566",
    bgColor: "bg-blue-500/10 dark:bg-blue-500/20",
    borderColor: "border-blue-500/30",
    badgeText: "PSE",
  },
  {
    id: "lulo",
    name: "Lulo Bank",
    shortName: "Lulo",
    color: "#00f5d4",
    bgColor: "bg-teal-500/10 dark:bg-teal-500/20",
    borderColor: "border-teal-500/30",
    badgeText: "Lulo",
  },
  {
    id: "nu",
    name: "Nu Colombia",
    shortName: "Nu",
    color: "#820ad1",
    bgColor: "bg-fuchsia-500/10 dark:bg-fuchsia-500/20",
    borderColor: "border-fuchsia-500/30",
    badgeText: "Nu",
  },
  {
    id: "dale",
    name: "dale!",
    shortName: "dale!",
    color: "#ff006e",
    bgColor: "bg-rose-500/10 dark:bg-rose-500/20",
    borderColor: "border-rose-500/30",
    badgeText: "dale!",
  },
];

export const DEFAULT_TRANSFER_METHODS = ["nequi", "daviplata", "bancolombia", "transfiya", "pse"];

export function getTransferMethodName(id: string | null | undefined): string {
  if (!id) return "";
  const match = COLOMBIA_TRANSFER_METHODS.find((m) => m.id === id);
  return match ? match.shortName : id;
}
