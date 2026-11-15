// Short names for kinds of paper (keys of Program.document_kinds). Interface copy only:
// what a provider actually asks for is always shown from its own documents_needed text.
export const DOC_LABEL: Record<string, string> = {
  id: "Photo ID",
  status: "Proof of citizenship or immigration status",
  income: "Proof of income",
  member_income: "Income of someone else at home",
  dob: "Birth dates for everyone at home",
  heat: "Heating or utility bill",
  lease: "Your lease",
  owner: "Mortgage, homeowner's insurance and property tax bills",
  aid: "Financial aid award letter",
  address: "Proof of address",
  shutoff: "Shut-off notice",
  notices: "Landlord or court notices",
  liheap: "Your Fuel Assistance (LIHEAP) number",
  umass: "UMass ID",
  adaapp: "Completed PVTA ADA application",
};

/** Label for a kind; unknown kinds fall back to the provider's own wording. */
export const docLabel = (kind: string, texts: string[]) => DOC_LABEL[kind] ?? texts[0] ?? kind;
