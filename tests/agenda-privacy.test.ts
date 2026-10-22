import assert from "node:assert/strict";
import test from "node:test";
import {
  BUSY_STATUS,
  BUSY_TITLE,
  busyPlaceholders,
  canSeeFullAgenda,
  defaultAppointmentStaffId,
  isBusyPlaceholder,
  ownAgendaStaffId,
  type AgendaBusySlot,
} from "../lib/agenda-privacy";

const slot = (date: string, start: string, end: string, isMine = false): AgendaBusySlot => ({
  appointment_date: date,
  start_time: start,
  end_time: end,
  is_mine: isMine,
});

test("owners see the full agenda", () => {
  assert.equal(canSeeFullAgenda({ isWorker: false, isWorkspaceAdmin: false }), true);
});

test("workspace admins see the full agenda", () => {
  assert.equal(canSeeFullAgenda({ isWorker: true, isWorkspaceAdmin: true }), true);
});

test("plain workers do not see the full agenda", () => {
  assert.equal(canSeeFullAgenda({ isWorker: true, isWorkspaceAdmin: false }), false);
});

test("a worker with calendar_all sees the full agenda", () => {
  const profile = { isWorker: true, isWorkspaceAdmin: false, staffId: "s1", workerPermissions: { calendar: true, calendar_all: true } };
  assert.equal(canSeeFullAgenda(profile), true);
  assert.equal(ownAgendaStaffId(profile), null);
});

test("calendar_all without calendar does not open the full agenda", () => {
  assert.equal(canSeeFullAgenda({ isWorker: true, isWorkspaceAdmin: false, workerPermissions: { calendar_all: true } }), false);
});

test("an unknown profile fails closed", () => {
  assert.equal(canSeeFullAgenda(null), false);
  assert.equal(canSeeFullAgenda(undefined), false);
});

test("a plain worker's agenda is locked to their own staff record", () => {
  assert.equal(ownAgendaStaffId({ isWorker: true, isWorkspaceAdmin: false, staffId: "s1" }), "s1");
  assert.equal(ownAgendaStaffId({ isWorker: true, isWorkspaceAdmin: true, staffId: "s1" }), null);
  assert.equal(ownAgendaStaffId({ isWorker: false, isWorkspaceAdmin: false, staffId: null }), null);
  assert.equal(ownAgendaStaffId(null), null);
});

test("busy slots that are the worker's own appointments are dropped", () => {
  const blocks = busyPlaceholders([
    slot("2026-10-21", "09:00:00", "10:00:00", true),
    slot("2026-10-21", "10:00:00", "11:00:00"),
  ]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].start_time, "10:00:00");
});

test("placeholders carry no identity at all", () => {
  const [block] = busyPlaceholders([slot("2026-10-21", "10:00:00", "11:00:00")]);
  assert.equal(block.title, BUSY_TITLE);
  assert.equal(block.status, BUSY_STATUS);
  assert.equal(block.customer_id, null);
  assert.equal(block.service_id, null);
  assert.equal(block.staff_id, null);
  assert.equal(block.customers, null);
  assert.equal(block.services, null);
  assert.equal(block.staff, null);
  assert.equal(block.notes, null);
  assert.equal(block.description, null);
  assert.equal(block.appointment_date, "2026-10-21");
  assert.equal(block.end_time, "11:00:00");
});

test("two people busy at the same time give two distinct placeholders", () => {
  const blocks = busyPlaceholders([
    slot("2026-10-21", "10:00:00", "11:00:00"),
    slot("2026-10-21", "10:00:00", "11:00:00"),
  ]);
  assert.equal(blocks.length, 2);
  assert.notEqual(blocks[0].id, blocks[1].id);
});

test("placeholders are recognized and real appointments are not", () => {
  const [block] = busyPlaceholders([slot("2026-10-21", "10:00:00", "11:00:00")]);
  assert.equal(isBusyPlaceholder(block), true);
  assert.equal(isBusyPlaceholder({ id: "7a1f6c1e-0000-4000-8000-000000000000" }), false);
});

test("a new appointment defaults to the user's own staff record when it is active", () => {
  const staffList = [{ id: "s1", status: "active" }, { id: "s2", status: "active" }];
  assert.equal(defaultAppointmentStaffId({ staffId: "s2", staffList, isEditing: false, current: null }), "s2");
});

test("an owner without a staff record keeps the automatic assignment", () => {
  const staffList = [{ id: "s1", status: "active" }];
  assert.equal(defaultAppointmentStaffId({ staffId: null, staffList, isEditing: false, current: null }), null);
});

test("an inactive or unknown own staff record is not used", () => {
  assert.equal(defaultAppointmentStaffId({ staffId: "s1", staffList: [{ id: "s1", status: "inactive" }], isEditing: false, current: null }), null);
  assert.equal(defaultAppointmentStaffId({ staffId: "s9", staffList: [{ id: "s1", status: "active" }], isEditing: false, current: null }), null);
});

test("editing never changes the appointment's staff", () => {
  const staffList = [{ id: "s1", status: "active" }, { id: "s2", status: "active" }];
  assert.equal(defaultAppointmentStaffId({ staffId: "s2", staffList, isEditing: true, current: "s1" }), "s1");
  assert.equal(defaultAppointmentStaffId({ staffId: "s2", staffList, isEditing: true, current: null }), null);
});

test("a person already chosen on a new appointment is kept", () => {
  const staffList = [{ id: "s1", status: "active" }, { id: "s2", status: "active" }];
  assert.equal(defaultAppointmentStaffId({ staffId: "s2", staffList, isEditing: false, current: "s1" }), "s1");
});
