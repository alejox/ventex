import {
  defaultModulesForType,
  modulesForType,
  visibleNavItems,
  type BusinessType,
  type Modules,
} from "@/config/business";

/**
 * Qué cambia en el menú al pasar de un tipo de negocio (y sus módulos) a otro.
 *
 * Cambiar el rubro en Ajustes reescribe `profiles.modules` y descarta en
 * silencio los módulos que el rubro nuevo no ofrece. Antes de guardar, la
 * pantalla tiene que poder decir "aparece X, desaparece Y" — y ese cálculo sale
 * de `visibleNavItems`, el MISMO que dibuja el sidebar, para que el aviso nunca
 * contradiga lo que se ve después.
 */
export interface NavChange {
  added: string[];
  removed: string[];
}

export function navChangeOnSwitch(
  from: { businessType: BusinessType | null; modules: Modules | null },
  to: { businessType: BusinessType | null; modules: Modules | null },
): NavChange {
  const before = visibleNavItems(from.businessType, from.modules);
  const after = visibleNavItems(to.businessType, to.modules);
  const beforeIds = new Set(before.map((i) => i.id));
  const afterIds = new Set(after.map((i) => i.id));
  return {
    added: after.filter((i) => !beforeIds.has(i.id)).map((i) => i.name),
    removed: before.filter((i) => !afterIds.has(i.id)).map((i) => i.name),
  };
}

/**
 * Módulos con los que arranca el formulario al elegir otro rubro: los
 * preseleccionados del rubro nuevo, respetando lo que el dueño ya había
 * decidido a mano para los módulos que ambos rubros comparten (si apagó
 * Inventario en el salón, sigue apagado en el lavaautos).
 */
export function modulesForSwitch(current: Modules, nextType: BusinessType): Modules {
  const next: Modules = { ...defaultModulesForType(nextType) };
  for (const id of modulesForType(nextType)) {
    if (current[id] !== undefined) next[id] = current[id];
  }
  return next;
}

/** Solo los módulos que ofrece el rubro, con valor explícito (lo que se guarda). */
export function cleanModulesForType(modules: Modules, businessType: BusinessType): Modules {
  const cleaned: Modules = {};
  for (const id of modulesForType(businessType)) cleaned[id] = Boolean(modules[id]);
  return cleaned;
}
