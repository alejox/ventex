import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConfirmLinkUrl,
  buildFamilyLinkUrl,
  materialInputGate,
  noticeShareGate,
  quotaGate,
  renderSchoolMessage,
  shareWhatsAppUrl,
} from "../services/school-materials.service";

// ---- Render de plantillas + seguridad del token (1-3) ----

test("1. `renderSchoolMessage` reemplaza variables sin interpretar $& del reemplazo", () => {
  const out = renderSchoolMessage(null, "material", {
    acudiente: "María",
    alumno: "Juan",
    titulo: "Partitura $& especial",
    enlace: "https://ventex.app/school/f/abc",
  });
  assert.match(out, /María/);
  assert.match(out, /Juan/);
  assert.match(out, /Partitura \$& especial/, "el valor literal no debe corromperse con $&");
  assert.doesNotMatch(out, /\{[a-zA-Z_]+\}/, "no debe quedar ninguna variable sin reemplazar");
});

test("2. una variable sin valor se va a la cadena vacía, no queda el token colgando", () => {
  const out = renderSchoolMessage(
    "Hola {acudiente}, clase de {instrumento} el {fecha}.",
    "reminder",
    { acudiente: "Ana", fecha: "24 sep" }
  );
  assert.doesNotMatch(out, /\{instrumento\}/);
  assert.doesNotMatch(out, /\{[a-zA-Z_]+\}/);
});

test("3. plantilla custom (guardada por el negocio) se respeta en vez del default", () => {
  const out = renderSchoolMessage("Aviso para {alumno}: {estado}", "attendance", {
    alumno: "Sofía",
    estado: "asistió",
    acudiente: "Carlos",
    instrumento: "piano",
    fecha: "24 sep",
  });
  assert.equal(out, "Aviso para Sofía: asistió");
});

// ---- Singularización pegada al token (4) ----

test("4. con 1 clase restante la palabra pegada al token va en singular", () => {
  const conUna = renderSchoolMessage(null, "reminder", {
    acudiente: "Ana",
    alumno: "Leo",
    instrumento: "guitarra",
    fecha: "lunes",
    hora: "15:00",
    clases: 1,
  });
  assert.match(conUna, /Saldo del plan: 1 clase\./);
  assert.doesNotMatch(conUna, /1 clases/);

  const conVarias = renderSchoolMessage(null, "reminder", {
    acudiente: "Ana",
    alumno: "Leo",
    instrumento: "guitarra",
    fecha: "lunes",
    hora: "15:00",
    clases: 3,
  });
  assert.match(conVarias, /Saldo del plan: 3 clases\./);
});

// ---- Límite de datos personales, por construcción (5) ----

test("5. el mensaje solo puede llevar los datos que el llamador puso en `vars` (un único alumno)", () => {
  // No existe una ruta para pasar una LISTA de alumnos: `vars` es un objeto
  // plano de variables de UN mensaje. Un segundo alumno solo podría aparecer
  // si alguien lo escribe a mano en un valor — la garantía es de diseño
  // (una llamada = un destinatario), no un filtro de texto libre.
  const out = renderSchoolMessage(null, "attendance", {
    acudiente: "Marta",
    alumno: "Único Alumno",
    instrumento: "violín",
    fecha: "24 sep",
    estado: "asistió",
  });
  assert.match(out, /Único Alumno/);
  // El renderer nunca agrega texto propio fuera de lo declarado en `vars`.
  assert.equal((out.match(/Único Alumno/g) ?? []).length, 1);
});

// ---- URLs de los enlaces de token (6) ----

test("6. `buildFamilyLinkUrl`/`buildConfirmLinkUrl` arman rutas anon fuera de /dashboard", () => {
  assert.equal(buildFamilyLinkUrl("https://ventex.app", "abc123"), "https://ventex.app/school/f/abc123");
  assert.equal(buildFamilyLinkUrl("https://ventex.app/", "abc123"), "https://ventex.app/school/f/abc123");
  assert.equal(buildConfirmLinkUrl("https://ventex.app", "xyz789"), "https://ventex.app/school/c/xyz789");
});

// ---- wa.me con y sin teléfono conocido (7) ----

test("7. `shareWhatsAppUrl` usa el teléfono si existe; sin teléfono cae al enlace sin destinatario", () => {
  const withPhone = shareWhatsAppUrl("3112329185", "hola");
  assert.match(withPhone, /^https:\/\/api\.whatsapp\.com\/send\?phone=573112329185&text=/);

  const withoutPhone = shareWhatsAppUrl(null, "hola");
  assert.equal(withoutPhone, `https://wa.me/?text=${encodeURIComponent("hola")}`);
});

// ---- Compuerta de avisos desactivados (8) ----

test("8. `noticeShareGate` bloquea cuando el acudiente desactivó los avisos", () => {
  assert.equal(noticeShareGate({ notices_enabled: true }).ok, true);
  const blocked = noticeShareGate({ notices_enabled: false });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason ?? "", /avisos desactivados/);
});

// ---- Espejo del CHECK exactamente-uno de materiales (9) ----

test("9. `materialInputGate` exige EXACTAMENTE archivo o enlace externo, nunca ambos vacíos", () => {
  assert.equal(materialInputGate({ kind: "file", hasFile: true, externalUrl: "" }).ok, true);
  assert.equal(materialInputGate({ kind: "file", hasFile: false, externalUrl: "" }).ok, false);
  assert.equal(
    materialInputGate({ kind: "link", hasFile: false, externalUrl: "https://youtu.be/x" }).ok,
    true
  );
  assert.equal(materialInputGate({ kind: "link", hasFile: false, externalUrl: "" }).ok, false);
  assert.equal(
    materialInputGate({ kind: "link", hasFile: false, externalUrl: "ftp://x" }).ok,
    false,
    "un enlace sin http(s) se rechaza"
  );
});

// ---- Cuota de almacenamiento (10) ----

test("10. `quotaGate` rechaza cuando el archivo supera lo que queda de cuota", () => {
  const quota = 100 * 1024 * 1024;
  assert.equal(quotaGate(0, quota, 10 * 1024 * 1024).ok, true);
  const over = quotaGate(95 * 1024 * 1024, quota, 10 * 1024 * 1024);
  assert.equal(over.ok, false);
  assert.match(over.reason ?? "", /cuota/);
});
