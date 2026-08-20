import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  amountMatches,
  buildSessionPayload,
  confirmationCode,
  confirmationOutcome,
  isTestTransaction,
  outcomeFromStatusText,
  pickRelevantTransaction,
  publicUrlBase,
  signConfirmation,
  verifyConfirmation,
  type ConfirmationFields,
  type EpaycoSecrets,
  type TransactionRow,
} from "../services/epayco-protocol";

const secrets: EpaycoSecrets = {
  custIdCliente: "1555973",
  pKey: "b1a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
};

/** Una confirmación tal como ePayco la POSTea: TODO son strings. */
const confirmation = (over: Partial<ConfirmationFields> = {}): ConfirmationFields => ({
  x_ref_payco: "45510327",
  x_transaction_id: "184623091",
  x_amount: "20000.00",
  x_currency_code: "COP",
  x_cod_response: "1",
  x_signature: "",
  x_id_invoice: "ventex-a1b2c3d4e5f6a7b8",
  x_test_request: "FALSE",
  ...over,
});

/** Firma de referencia calculada a mano, sin pasar por el código bajo prueba. */
function referenceSignature(f: ConfirmationFields): string {
  return createHash("sha256")
    .update(
      [
        secrets.custIdCliente,
        secrets.pKey,
        f.x_ref_payco,
        f.x_transaction_id,
        f.x_amount,
        f.x_currency_code,
      ].join("^"),
      "utf8",
    )
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Firma
// ---------------------------------------------------------------------------

test("1. La firma es sha256 de los seis valores unidos por '^', en ese orden", () => {
  const fields = confirmation();
  assert.equal(signConfirmation(fields, secrets), referenceSignature(fields));

  // El orden no es decorativo: permutar dos valores tiene que dar otro hash.
  const permutado = createHash("sha256")
    .update(
      [
        secrets.custIdCliente,
        secrets.pKey,
        fields.x_transaction_id,
        fields.x_ref_payco,
        fields.x_amount,
        fields.x_currency_code,
      ].join("^"),
      "utf8",
    )
    .digest("hex");
  assert.notEqual(signConfirmation(fields, secrets), permutado);
});

test("2. Una confirmación bien firmada valida", () => {
  const fields = confirmation();
  const firmada = { ...fields, x_signature: referenceSignature(fields) };
  assert.equal(verifyConfirmation(firmada, secrets), true);
});

test("3. Tocar el monto invalida la firma", () => {
  const fields = confirmation();
  const firmada = { ...fields, x_signature: referenceSignature(fields) };

  // El caso que importa: alguien reenvía la notificación con otro monto para
  // que le acreditemos un plan caro habiendo pagado uno barato.
  assert.equal(
    verifyConfirmation({ ...firmada, x_amount: "200000.00" }, secrets),
    false,
  );
  assert.equal(
    verifyConfirmation({ ...firmada, x_ref_payco: "45510328" }, secrets),
    false,
  );
  assert.equal(
    verifyConfirmation({ ...firmada, x_currency_code: "USD" }, secrets),
    false,
  );
});

test("4. TRAMPA: el monto se firma como STRING, no como número", () => {
  // ePayco manda "20000.00". Si en el camino alguien lo parsea a Number y lo
  // vuelve a serializar queda "20000", y el hash deja de coincidir aunque el
  // valor sea el mismo. Los campos se firman EXACTAMENTE como llegaron.
  const fields = confirmation({ x_amount: "20000.00" });
  const firmada = { ...fields, x_signature: referenceSignature(fields) };

  assert.equal(verifyConfirmation(firmada, secrets), true);
  assert.equal(
    verifyConfirmation({ ...firmada, x_amount: String(Number("20000.00")) }, secrets),
    false,
    "reformatear el monto rompe la firma: nunca normalizar antes de verificar",
  );
});

test("5. Una firma ausente, corta o no hexadecimal devuelve false sin explotar", () => {
  const fields = confirmation();

  for (const basura of ["", "  ", "no-es-hex", "zz", "ff", "1234", "ñ".repeat(64)]) {
    assert.equal(
      verifyConfirmation({ ...fields, x_signature: basura }, secrets),
      false,
      `firma inválida: ${JSON.stringify(basura)}`,
    );
  }
});

test("6. Sin secretos configurados NUNCA valida", () => {
  // Un deploy al que le falta P_KEY no puede aceptar confirmaciones: sería
  // acreditar licencias contra una firma que no verificamos.
  const fields = confirmation();
  const firmada = { ...fields, x_signature: referenceSignature(fields) };

  assert.equal(verifyConfirmation(firmada, { custIdCliente: "", pKey: "" }), false);
  assert.equal(verifyConfirmation(firmada, { custIdCliente: "1555973", pKey: "" }), false);
});

// ---------------------------------------------------------------------------
// Códigos de respuesta
// ---------------------------------------------------------------------------

test("7. Sólo el código 1 acredita", () => {
  assert.equal(confirmationOutcome("1"), "paid");
  assert.equal(confirmationOutcome(1), "paid");
});

test("8. Rechazos y abandonos son fallo definitivo", () => {
  assert.equal(confirmationOutcome("2"), "failed", "Rechazada");
  assert.equal(confirmationOutcome("4"), "failed", "Fallida");
  assert.equal(confirmationOutcome("9"), "failed", "Caducada");
  assert.equal(confirmationOutcome("10"), "failed", "Abandonada");
  assert.equal(confirmationOutcome("11"), "failed", "Cancelada");
});

test("9. Pendiente e Iniciada esperan: no son fallo", () => {
  // PSE tarda hasta 20 minutos. Marcar la orden como fallida acá le rompe el
  // pago a alguien que sí pagó.
  assert.equal(confirmationOutcome("3"), "pending", "Pendiente");
  assert.equal(confirmationOutcome("8"), "pending", "Iniciada");
});

test("10. RETENIDO (7) no es un pago: queda pendiente", () => {
  // El 7 es validación antifraude. Tratarlo como acreditado entrega la
  // licencia antes de que la plata esté firme.
  assert.equal(confirmationOutcome("7"), "pending");
});

test("11. REVERSADA (6) es su propio estado, no un fallo cualquiera", () => {
  // Es una devolución sobre algo que YA se había acreditado. Confundirla con
  // "failed" haría que se trate como un cobro que nunca entró, y con "paid"
  // acreditaría una licencia sobre plata devuelta.
  assert.equal(confirmationOutcome("6"), "reversed");
});

test("12. Un código desconocido NO acredita", () => {
  // Falla cerrado: si ePayco agrega un estado nuevo, el default no puede ser
  // regalar la licencia.
  for (const raro of ["0", "5", "99", "", "abc", null, undefined]) {
    assert.equal(
      confirmationOutcome(raro as string),
      "pending",
      `código desconocido: ${JSON.stringify(raro)}`,
    );
  }
});

test("13. x_test_request distingue la transacción de prueba", () => {
  // Una confirmación de prueba llegando a producción no puede activar nada.
  assert.equal(isTestTransaction(confirmation({ x_test_request: "TRUE" })), true);
  assert.equal(isTestTransaction(confirmation({ x_test_request: "true" })), true);
  assert.equal(isTestTransaction(confirmation({ x_test_request: "FALSE" })), false);
  assert.equal(isTestTransaction(confirmation({ x_test_request: "" })), false);
});

// ---------------------------------------------------------------------------
// Payload de la sesión de checkout
// ---------------------------------------------------------------------------

const sessionParams = {
  amount: 49900,
  orderId: "ventex-a1b2c3d4e5f6a7b8",
  orderUuid: "3f608f4e-4ac8-4846-bdce-12ebf2fe92d3",
  description: "Ventex · Pro Mensual",
  confirmationUrl: "https://ventex.app/api/billing/webhook",
  responseUrl: "https://ventex.app/dashboard/subscription?pay=3f608f4e",
  payer: {
    name: "Juan Mesa",
    email: "juan@ejemplo.com",
    document: "80755975",
    documentType: "CC",
    phone: "3000000000",
  },
};

test("14. El payload lleva los cuatro campos que ePayco exige", () => {
  const body = buildSessionPayload(sessionParams);

  assert.equal(body.checkout_version, "2");
  assert.equal(body.currency, "COP");
  assert.equal(body.country, "CO");
  assert.equal(typeof body.amount, "number", "amount va como número, no string");
  assert.equal(body.amount, 49900);
  assert.ok(body.name, "name es requerido");
});

test("15. `invoice` lleva NUESTRO order_id, y `extras` el uuid de la orden", () => {
  const body = buildSessionPayload(sessionParams);

  // Sin esto la conciliación es imposible: la confirmación vuelve con
  // x_id_invoice y es lo único que ata la transacción a `billing_orders`.
  assert.equal(body.invoice, "ventex-a1b2c3d4e5f6a7b8");
  // El uuid viaja aparte porque el webhook resuelve la fila por PK, no por el
  // order_id legible.
  assert.equal(body.extras?.extra1, "3f608f4e-4ac8-4846-bdce-12ebf2fe92d3");
});

test("16. Las URLs de confirmación y respuesta van en el payload", () => {
  const body = buildSessionPayload(sessionParams);

  assert.equal(body.confirmation, "https://ventex.app/api/billing/webhook");
  assert.equal(body.response, "https://ventex.app/dashboard/subscription?pay=3f608f4e");
  assert.equal(body.method, "POST", "la confirmación tiene que llegar por POST");
});

test("17. Los datos del titular van en `billing`", () => {
  const body = buildSessionPayload(sessionParams);

  assert.equal(body.billing?.email, "juan@ejemplo.com");
  assert.equal(body.billing?.name, "Juan Mesa");
  assert.equal(body.billing?.typeDoc, "CC");
  assert.equal(body.billing?.numberDoc, "80755975");
  assert.equal(body.billing?.mobilePhone, "3000000000");
  assert.equal(body.billing?.callingCode, "+57");
});

test("18. Un titular sin teléfono no rompe el payload", () => {
  const body = buildSessionPayload({
    ...sessionParams,
    payer: { ...sessionParams.payer, phone: "" },
  });

  assert.equal(body.billing?.mobilePhone, undefined);
  assert.equal(body.billing?.email, "juan@ejemplo.com");
});

test("19. La descripción se recorta y nunca queda vacía", () => {
  const largo = buildSessionPayload({ ...sessionParams, description: "x".repeat(400) });
  assert.ok((largo.description ?? "").length <= 255);

  const vacio = buildSessionPayload({ ...sessionParams, description: "   " });
  assert.ok(vacio.description, "una descripción vacía se reemplaza, no se manda en blanco");
});

test("20. Un monto inválido se rechaza acá, no en ePayco", () => {
  for (const malo of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => buildSessionPayload({ ...sessionParams, amount: malo }),
      /monto/i,
      `monto inválido: ${malo}`,
    );
  }
});

// ---------------------------------------------------------------------------
// De qué campo sale el código
// ---------------------------------------------------------------------------

test("21. El código se lee de x_cod_response O de x_cod_transaction_state", () => {
  // La MISMA página de la doc oficial usa los dos nombres indistintamente
  // ("los códigos de respuesta (x_cod_transaction_state) y response
  // (x_cod_transaction_state)"). Leer sólo uno deja pasar confirmaciones
  // enteras sin estado, que caerían en el default y nunca acreditarían.
  assert.equal(confirmationCode({ ...confirmation(), x_cod_response: "1" }), "1");

  const soloEstado = confirmation();
  delete soloEstado.x_cod_response;
  soloEstado.x_cod_transaction_state = "1";
  assert.equal(confirmationCode(soloEstado), "1");
});

test("22. Si vienen los dos, manda x_cod_response", () => {
  const ambos = confirmation({ x_cod_response: "1", x_cod_transaction_state: "3" });
  assert.equal(confirmationCode(ambos), "1");
});

test("23. Sin ninguno de los dos, el resultado es pendiente y no acredita", () => {
  const ninguno = confirmation();
  delete ninguno.x_cod_response;
  assert.equal(confirmationCode(ninguno), "");
  assert.equal(confirmationOutcome(confirmationCode(ninguno)), "pending");
});

// ---------------------------------------------------------------------------
// El OTRO vocabulario: el del listado de transacciones
// ---------------------------------------------------------------------------

test("24. El listado devuelve el estado como TEXTO, no como número", () => {
  // `POST /transaction` contesta `status: "Cancelada"`, no `x_cod_response: 11`.
  // Son dos vocabularios para lo mismo: pasarle el texto a
  // `confirmationOutcome` devolvería "pending" siempre y el polling nunca
  // cerraría un pago.
  assert.equal(outcomeFromStatusText("Aceptada"), "paid");
  assert.equal(outcomeFromStatusText("Rechazada"), "failed");
  assert.equal(outcomeFromStatusText("Fallida"), "failed");
  assert.equal(outcomeFromStatusText("Caducada"), "failed");
  assert.equal(outcomeFromStatusText("Abandonada"), "failed");
  assert.equal(outcomeFromStatusText("Cancelada"), "failed");
  assert.equal(outcomeFromStatusText("Pendiente"), "pending");
  assert.equal(outcomeFromStatusText("Retenido"), "pending");
  assert.equal(outcomeFromStatusText("Iniciada"), "pending");
  assert.equal(outcomeFromStatusText("Reversada"), "reversed");
});

test("25. El texto del estado se compara sin importar mayúsculas ni acentos", () => {
  assert.equal(outcomeFromStatusText("aceptada"), "paid");
  assert.equal(outcomeFromStatusText("ACEPTADA"), "paid");
  assert.equal(outcomeFromStatusText("  Aceptada  "), "paid");
  assert.equal(outcomeFromStatusText("Aceptáda"), "paid", "un acento de más no puede regalar el pago... ni negarlo");
});

test("26. Un texto de estado desconocido NO acredita", () => {
  for (const raro of ["", "  ", "Vencida", "Whatever", null, undefined]) {
    assert.equal(outcomeFromStatusText(raro as string), "pending");
  }
});

// ---------------------------------------------------------------------------
// Cruce del monto
// ---------------------------------------------------------------------------

test("27. El monto recibido se cruza contra el de la orden", () => {
  // La firma NO cubre el estado, y cubre el monto sólo para probar que nadie
  // lo tocó EN TRÁNSITO. Que sea el monto CORRECTO para esta orden es una
  // pregunta distinta, y es la que impide activar un plan caro pagando el barato.
  assert.equal(amountMatches("49900.00", 49900), true);
  assert.equal(amountMatches("49900", 49900), true);
  assert.equal(amountMatches("49900.0", 49900), true);
  assert.equal(amountMatches("49900.00", 49900.0), true);

  assert.equal(amountMatches("4990.00", 49900), false);
  assert.equal(amountMatches("499000.00", 49900), false);
  assert.equal(amountMatches("0", 49900), false);
});

test("28. Los centavos cuentan: no se redondea a favor de nadie", () => {
  assert.equal(amountMatches("1000.50", 1000.5), true);
  assert.equal(amountMatches("1000.50", 1000.49), false);
  assert.equal(amountMatches("1000.51", 1000.5), false);
});

test("29. Un monto ilegible nunca coincide", () => {
  for (const malo of ["", "  ", "abc", "NaN", null, undefined]) {
    assert.equal(amountMatches(malo as string, 49900), false, `monto: ${JSON.stringify(malo)}`);
  }
  assert.equal(amountMatches("49900", Number.NaN), false);
});

// ---------------------------------------------------------------------------
// Varias transacciones para el mismo invoice
// ---------------------------------------------------------------------------

const tx = (status: string, at: string): TransactionRow => ({
  referencePayco: at.replace(/\D/g, "").slice(-9),
  referenceClient: "ventex-a1b2c3d4e5f6a7b8",
  amount: 49900,
  currency: "COP",
  status,
  transactionDateTime: at,
});

test("30. Sin transacciones no hay nada que elegir", () => {
  assert.equal(pickRelevantTransaction([]), null);
});

test("31. Con una sola, esa es", () => {
  const una = tx("Pendiente", "2026-08-20 10:00:00");
  assert.equal(pickRelevantTransaction([una]), una);
});

test("32. El pago APROBADO gana aunque sea el más viejo", () => {
  // El caso real: pagó, y después volvió a abrir el checkout y lo cerró. La
  // cancelación es más reciente, pero la plata ya entró. Quedarse con "la
  // última" dejaría sin licencia a alguien que pagó.
  const pago = tx("Aceptada", "2026-08-20 10:00:00");
  const cancelado = tx("Cancelada", "2026-08-20 11:30:00");

  assert.equal(pickRelevantTransaction([pago, cancelado]), pago);
  assert.equal(pickRelevantTransaction([cancelado, pago]), pago, "el orden del array no decide");
});

test("33. Entre intentos NO aprobados, manda el más reciente", () => {
  const viejo = tx("Rechazada", "2026-08-20 09:00:00");
  const nuevo = tx("Pendiente", "2026-08-20 12:00:00");

  assert.equal(pickRelevantTransaction([viejo, nuevo]), nuevo);
  assert.equal(pickRelevantTransaction([nuevo, viejo]), nuevo);
});

test("34. Con dos aprobados gana el más reciente de los aprobados", () => {
  const primero = tx("Aceptada", "2026-08-20 09:00:00");
  const segundo = tx("Aceptada", "2026-08-20 15:00:00");
  assert.equal(pickRelevantTransaction([primero, segundo]), segundo);
});

test("35. Una fila sin fecha no rompe la elección", () => {
  const sinFecha: TransactionRow = { status: "Pendiente" };
  const conFecha = tx("Pendiente", "2026-08-20 10:00:00");

  assert.equal(pickRelevantTransaction([sinFecha, conFecha]), conFecha);
  assert.ok(pickRelevantTransaction([sinFecha]), "una sola sin fecha sigue siendo la elegida");
});

// ---------------------------------------------------------------------------
// ePayco no acepta el hostname `localhost`
// ---------------------------------------------------------------------------

test("36. `localhost` se reescribe a 127.0.0.1", () => {
  // Verificado contra la API real: con `localhost`, `session/create` responde
  // "property Response is not a valid URL" y NO se crea la sesión. Con
  // 127.0.0.1 pasa. No es cuestión de HTTPS: `http://` público también pasa.
  // Sin esto, el checkout es imposible de probar en desarrollo.
  assert.equal(publicUrlBase("http://localhost:3000"), "http://127.0.0.1:3000");
  assert.equal(publicUrlBase("http://localhost"), "http://127.0.0.1");
  assert.equal(publicUrlBase("https://localhost:3001"), "https://127.0.0.1:3001");
});

test("37. Un dominio público no se toca", () => {
  assert.equal(publicUrlBase("https://ventex.app"), "https://ventex.app");
  assert.equal(publicUrlBase("https://ventex.app/base"), "https://ventex.app/base");
});

test("38. La barra final se saca siempre", () => {
  assert.equal(publicUrlBase("https://ventex.app/"), "https://ventex.app");
  assert.equal(publicUrlBase("http://localhost:3000/"), "http://127.0.0.1:3000");
});

test("39. Sólo se reescribe el host EXACTO, no el que lo contiene", () => {
  // `localhost.ventex.app` es un dominio real y distinto: pisarlo con un
  // reemplazo de texto lo mandaría a ninguna parte.
  assert.equal(
    publicUrlBase("https://localhost.ventex.app"),
    "https://localhost.ventex.app",
  );
  assert.equal(
    publicUrlBase("https://mi-localhost.com/x"),
    "https://mi-localhost.com/x",
  );
});

test("40. Una base ilegible se devuelve tal cual, sin romper", () => {
  // Preferible mandar algo que ePayco rechace con un mensaje claro, antes que
  // tirar una excepción dentro de la ruta de cobro.
  assert.equal(publicUrlBase("no-es-una-url"), "no-es-una-url");
  assert.equal(publicUrlBase(""), "");
});

test("41. 'pre-procesada' (OTP de Daviplata) queda pendiente", () => {
  // Estado REAL visto en sandbox que NO figura en la lista documentada de
  // ePayco: "pre-procesada / Esperando generación de OTP por Daviplata".
  // Prueba de que la lista publicada está incompleta y de que el default tiene
  // que seguir siendo pendiente y no acreditar.
  assert.equal(outcomeFromStatusText("pre-procesada"), "pending");
  assert.equal(outcomeFromStatusText("Pre-Procesada"), "pending");
  assert.equal(outcomeFromStatusText("preprocesada"), "pending");
});
