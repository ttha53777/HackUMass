"use client";

// Identity details read from the person's papers (name, birth date, address,
// phone, email), kept in this browser only (IndexedDB), per session. The server
// returns them once after reading a paper and never stores them. Nothing here
// is used for a form until the person confirms it on the "My details" card.
// Like the paper store, every access is wrapped: blocked storage falls back to
// memory for this visit.
import { useCallback, useEffect, useState } from "react";

import type { IdentityKey, IdentityReading } from "@/lib/types";

export type Detail = {
  /** `${sessionId}:${key}` */
  id: string;
  sessionId: string;
  key: IdentityKey;
  value: string;
  /** "doc:<id>" for a paper, "typed" when the person wrote it. */
  source: string;
  /** Which paper it came from, for the card ("your lease"). */
  sourceTitle: string | null;
  /**
   * The saved paper (paper-store id) it was read from, so that paper's "Helper reads" switch
   * can hold it back. Null when the person typed it; missing on details saved before this existed.
   */
  paperId?: string | null;
  /** The kind the paper was read as, so a per-kind "Helper reads" switch can hold it back. */
  paperKind?: string | null;
  confirmed: boolean;
  /** A later paper read a different value for a detail already confirmed. */
  other: { value: string; sourceTitle: string | null } | null;
  updatedAt: string;
};

export const DETAIL_LABEL: Record<IdentityKey, string> = {
  full_name: "Full name",
  first_name: "First name",
  last_name: "Last name",
  date_of_birth: "Date of birth",
  street_address: "Street address",
  city: "City",
  state: "State",
  zip: "ZIP code",
  phone: "Phone",
  email: "Email",
  member_2_name: "Person 2 name",
  member_2_relation: "Person 2 relationship",
  member_2_dob: "Person 2 date of birth",
  member_3_name: "Person 3 name",
  member_3_relation: "Person 3 relationship",
  member_3_dob: "Person 3 date of birth",
  employer_name: "Employer",
  employer_address: "Employer address",
  employer_phone: "Employer phone",
  earned_income_monthly: "Your monthly pay",
  hours_per_week: "Hours per week",
  other_income_source: "Other income",
  other_income_amount: "Other income each month",
  other_income_person: "Other income goes to",
  monthly_rent: "Monthly rent",
  heat_included: "Heat included in rent",
  heating_fuel: "Heating fuel",
  landlord_name: "Landlord",
  landlord_address: "Landlord address",
  landlord_phone: "Landlord phone",
  utility_company: "Utility company",
  utility_account_number: "Utility account number",
  amount_past_due: "Amount past due",
  rent_owed: "Rent owed",
  notice_date: "Landlord notice date",
  liheap_number: "Fuel Assistance number",
};

/** Details grouped for the "Your details" card. First and last name follow from the full name, so they are not listed. */
export const DETAIL_GROUPS: { title: string; keys: IdentityKey[] }[] = [
  { title: "You", keys: ["full_name", "date_of_birth", "street_address", "city", "state", "zip", "phone", "email"] },
  { title: "Household", keys: ["member_2_name", "member_2_relation", "member_2_dob", "member_3_name", "member_3_relation", "member_3_dob"] },
  { title: "Work and income", keys: ["employer_name", "employer_address", "employer_phone", "earned_income_monthly", "hours_per_week", "other_income_source", "other_income_amount", "other_income_person"] },
  { title: "Home", keys: ["monthly_rent", "heat_included", "heating_fuel", "landlord_name", "landlord_address", "landlord_phone", "rent_owed", "notice_date"] },
  { title: "Bills and benefits", keys: ["utility_company", "utility_account_number", "amount_past_due", "liheap_number"] },
];

/** Shown in this order. */
export const DETAIL_ORDER: IdentityKey[] = DETAIL_GROUPS.flatMap((g) => g.keys);

const DB = "opendoor-details";
const STORE = "details";
const memory = new Map<string, Detail>();

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("session", "sessionId");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function listDetails(sessionId: string): Promise<Detail[]> {
  const stored = (await run<Detail[]>("readonly", (s) => s.index("session").getAll(sessionId))) ?? [];
  const fromMemory = [...memory.values()].filter((d) => d.sessionId === sessionId && !stored.some((s) => s.id === d.id));
  return [...stored, ...fromMemory];
}

async function putDetail(detail: Detail): Promise<void> {
  const ok = await run("readwrite", (s) => s.put(detail));
  if (ok === null) memory.set(detail.id, detail);
}

async function deleteDetail(id: string): Promise<void> {
  memory.delete(id);
  await run("readwrite", (s) => s.delete(id));
}

const same = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/** The result of saving a paper's readings, for the toast and the name check. */
export type SaveOutcome = {
  added: number;
  /** The paper names someone other than the confirmed full name. */
  otherPerson: string | null;
};

/** The person's details for this session: save readings, confirm, edit, remove. */
export function useDetails(sessionId: string | null) {
  const [details, setDetails] = useState<Detail[]>([]);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setDetails(await listDetails(sessionId));
  }, [sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is only readable after mount
    void refresh();
  }, [refresh]);

  /**
   * Keep what a paper read. A new detail is saved unconfirmed. A confirmed detail
   * is never overwritten: a different reading is kept beside it to choose from.
   */
  const saveReadings = useCallback(
    async (readings: IdentityReading[], sourceTitle: string | null, paperId: string | null = null, paperKind: string | null = null): Promise<SaveOutcome> => {
      if (!sessionId) return { added: 0, otherPerson: null };
      const current = await listDetails(sessionId);
      const byKey = new Map(current.map((d) => [d.key, d]));
      const confirmedName = byKey.get("full_name");
      const readName = readings.find((r) => r.key === "full_name")?.value ?? null;
      const otherPerson =
        confirmedName?.confirmed && readName && !same(confirmedName.value, readName) ? readName : null;
      let added = 0;
      const now = new Date().toISOString();
      for (const r of readings) {
        // A paper for someone else in the household: keep nothing but the flag.
        if (otherPerson) break;
        const existing = byKey.get(r.key);
        if (existing && same(existing.value, r.value)) continue;
        if (existing?.confirmed) {
          await putDetail({ ...existing, other: { value: r.value, sourceTitle }, updatedAt: now });
          continue;
        }
        await putDetail({
          id: `${sessionId}:${r.key}`,
          sessionId,
          key: r.key,
          value: r.value,
          source: r.source,
          sourceTitle,
          paperId,
          paperKind,
          confirmed: false,
          other: null,
          updatedAt: now,
        });
        added += 1;
      }
      await refresh();
      return { added, otherPerson };
    },
    [sessionId, refresh],
  );

  const confirm = useCallback(
    async (detail: Detail, value?: string) => {
      const next = value ?? detail.value;
      const typed = value !== undefined && !same(value, detail.value);
      await putDetail({
        ...detail,
        value: next,
        source: typed ? "typed" : detail.source,
        // A value the person typed is theirs, not the paper's: no paper switch holds it back.
        paperId: typed ? null : (detail.paperId ?? null),
        confirmed: true,
        other: null,
        updatedAt: new Date().toISOString(),
      });
      // First and last name follow the full name.
      if (detail.key === "full_name" && sessionId) {
        const parts = next.trim().split(/\s+/);
        if (parts.length >= 2) {
          for (const [key, part] of [["first_name", parts[0]], ["last_name", parts[parts.length - 1]]] as const) {
            await putDetail({ ...detail, id: `${sessionId}:${key}`, key, value: part, confirmed: true, other: null });
          }
        }
      }
      await refresh();
    },
    [sessionId, refresh],
  );

  const remove = useCallback(
    async (detail: Detail) => {
      await deleteDetail(detail.id);
      if (detail.key === "full_name" && sessionId) {
        await deleteDetail(`${sessionId}:first_name`);
        await deleteDetail(`${sessionId}:last_name`);
      }
      await refresh();
    },
    [sessionId, refresh],
  );

  return { details, saveReadings, confirm, remove };
}
