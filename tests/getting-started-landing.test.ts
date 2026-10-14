import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isBusinessReady,
  landingPathFor,
  needsLandingFacts,
  PANEL_PATH,
  POS_PATH,
  type LandingFacts,
} from "@/lib/getting-started";

const READY: LandingFacts = { businessConfigured: true, hasProduct: true, hasService: false };
const EMPTY: LandingFacts = { businessConfigured: false, hasProduct: false, hasService: false };

const owner = { isWorker: false, businessType: "tienda" as const };

test("trabajador: siempre al POS, aunque el negocio no esté configurado", () => {
  const worker = { isWorker: true, businessType: "salon" as const };
  assert.equal(landingPathFor(worker, EMPTY), POS_PATH);
  assert.equal(landingPathFor(worker, null), POS_PATH);
  assert.equal(needsLandingFacts(worker), false);
});

test("dueño sin tipo de negocio (onboarding pendiente): al Panel", () => {
  const pending = { isWorker: false, businessType: null };
  assert.equal(landingPathFor(pending, READY), PANEL_PATH);
  assert.equal(landingPathFor(pending, null), PANEL_PATH);
  assert.equal(needsLandingFacts(pending), false);
});

test("dueño con datos del negocio y un producto: al POS", () => {
  assert.equal(needsLandingFacts(owner), true);
  assert.equal(landingPathFor(owner, READY), POS_PATH);
});

test("dueño con datos del negocio y solo un servicio: al POS", () => {
  const facts = { businessConfigured: true, hasProduct: false, hasService: true };
  assert.equal(isBusinessReady(facts), true);
  assert.equal(landingPathFor({ isWorker: false, businessType: "salon" }, facts), POS_PATH);
});

test("dueño con datos del negocio pero sin catálogo: al Panel", () => {
  const facts = { businessConfigured: true, hasProduct: false, hasService: false };
  assert.equal(isBusinessReady(facts), false);
  assert.equal(landingPathFor(owner, facts), PANEL_PATH);
});

test("dueño con catálogo pero sin datos del negocio: al Panel", () => {
  const facts = { businessConfigured: false, hasProduct: true, hasService: true };
  assert.equal(isBusinessReady(facts), false);
  assert.equal(landingPathFor(owner, facts), PANEL_PATH);
});

test("dueño sin hechos (la consulta no se pudo hacer): al POS, nunca atrapado en el Panel", () => {
  assert.equal(landingPathFor(owner, null), POS_PATH);
});
