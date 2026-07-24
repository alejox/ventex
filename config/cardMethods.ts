export interface CardMethodOption {
  id: string;
  name: string;
  shortName: string;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeText?: string;
}

export const COLOMBIA_CARD_METHODS: CardMethodOption[] = [
  {
    id: "bold",
    name: "Bold Datáfono",
    shortName: "Bold",
    color: "#ff3b30",
    bgColor: "bg-red-500/10 dark:bg-red-500/20",
    borderColor: "border-red-500/30",
    badgeText: "Bold",
  },
  {
    id: "credibanco",
    name: "Credibanco",
    shortName: "Credibanco",
    color: "#0052cc",
    bgColor: "bg-blue-500/10 dark:bg-blue-500/20",
    borderColor: "border-blue-500/30",
    badgeText: "Credibanco",
  },
  {
    id: "redeban",
    name: "Redeban",
    shortName: "Redeban",
    color: "#e60000",
    bgColor: "bg-rose-500/10 dark:bg-rose-500/20",
    borderColor: "border-rose-500/30",
    badgeText: "Redeban",
  },
  {
    id: "sumup",
    name: "SumUp Datáfono",
    shortName: "SumUp",
    color: "#00d2b5",
    bgColor: "bg-teal-500/10 dark:bg-teal-500/20",
    borderColor: "border-teal-500/30",
    badgeText: "SumUp",
  },
  {
    id: "mercadopago",
    name: "Mercado Pago POS",
    shortName: "Mercado Pago",
    color: "#009ee3",
    bgColor: "bg-sky-500/10 dark:bg-sky-500/20",
    borderColor: "border-sky-500/30",
    badgeText: "MPago",
  },
  {
    id: "visa_mastercard",
    name: "Visa / Mastercard General",
    shortName: "General",
    color: "#1a1f71",
    bgColor: "bg-indigo-500/10 dark:bg-indigo-500/20",
    borderColor: "border-indigo-500/30",
    badgeText: "Tarjeta",
  },
];

export const DEFAULT_CARD_METHODS = ["bold", "credibanco", "redeban", "sumup", "mercadopago"];

export function getCardMethodName(id: string | null | undefined): string {
  if (!id) return "";
  const match = COLOMBIA_CARD_METHODS.find((m) => m.id === id);
  return match ? match.shortName : id;
}
