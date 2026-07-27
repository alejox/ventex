import { useEffect, useRef, useState } from "react";
import { useOpenFactsStore } from "@/stores/openfacts.store";
import type { OpenFactsProduct } from "@/services/openfacts.service";

const MIN_LENGTH = 8;
const DEBOUNCE_MS = 600;

export function useBarcodeLookup(
  barcode: string,
  onFound?: (product: OpenFactsProduct) => void,
) {
  const lookup = useOpenFactsStore((s) => s.lookup);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeRef = useRef(barcode);
  const onFoundRef = useRef(onFound);

  useEffect(() => { barcodeRef.current = barcode; });
  useEffect(() => { onFoundRef.current = onFound; });

  const [searchingBarcode, setSearchingBarcode] = useState<string | null>(null);
  const [result, setResult] = useState<OpenFactsProduct | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = barcode?.trim() ?? "";
    if (trimmed.length < MIN_LENGTH) return;

    const current = trimmed;
    timerRef.current = setTimeout(async () => {
      setSearchingBarcode(current);
      const product = await lookup(current);
      if (barcodeRef.current?.trim() !== current) return;
      setResult(product);
      setSearchingBarcode(null);
      if (product && onFoundRef.current) onFoundRef.current(product);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [barcode, lookup]);

  const product = (barcode?.trim().length ?? 0) >= MIN_LENGTH ? result : null;
  const searching = searchingBarcode === barcode?.trim();

  return { product, searching };
}
