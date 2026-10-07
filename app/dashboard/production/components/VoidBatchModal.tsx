"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useProductionStore } from "@/stores/production.store";
import { notifySuccess } from "@/lib/notifications";
import { formatQty } from "@/lib/recipe-editor";
import type { ProductionBatch } from "@/services/production.service";

interface VoidBatchModalProps {
  batch: ProductionBatch;
  productName: string;
  onClose: () => void;
}

/**
 * Anular un lote revierte EXACTAMENTE lo que movió: devuelve cada insumo y
 * saca lo producido. Se pide el motivo (queda en el lote) y se avisa lo que
 * puede sorprender: si ya se usó parte del preparado, su stock queda en
 * negativo; el costo del preparado no cambia.
 */
export function VoidBatchModal({ batch, productName, onClose }: VoidBatchModalProps) {
  const voidBatch = useProductionStore((s) => s.voidBatch);
  const voidingId = useProductionStore((s) => s.voidingId);
  const error = useProductionStore((s) => s.error);
  const [reason, setReason] = useState("");
  const busy = voidingId === batch.id;

  const confirm = async () => {
    const result = await voidBatch(batch.id, reason);
    if (!result) return;
    notifySuccess(
      `Lote #${batch.batch_number} anulado`,
      result.output_went_negative
        ? `Los insumos volvieron al stock. ${productName} quedó en negativo porque ya se había usado parte del lote.`
        : "Los insumos volvieron al stock y se descontó lo producido.",
    );
    onClose();
  };

  return (
    <Modal
      open
      role="alertdialog"
      onClose={() => { if (!busy) onClose(); }}
      title={`¿Anular el lote #${batch.batch_number}?`}
      description={`Se descuentan ${formatQty(batch.output_qty, batch.output_unit)} de ${productName} y vuelven al stock los insumos que gastó.`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy} loadingLabel="Anulando…">
            Anular lote
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="void-reason" className="text-[13px] font-semibold text-on-surface block">
            Motivo <span className="font-normal text-on-surface-variant">(opcional)</span>
          </label>
          <input
            id="void-reason"
            data-autofocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. Lo registré dos veces"
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/50"
          />
        </div>
        <p className="text-xs text-on-surface-variant">El costo del preparado no cambia al anular.</p>
        {error && (
          <p role="alert" className="text-sm text-error bg-error-container/10 rounded-xl px-4 py-3 border border-error-container/20">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
