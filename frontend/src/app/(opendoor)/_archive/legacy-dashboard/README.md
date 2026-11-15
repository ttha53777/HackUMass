# Archived: the old dashboard

Not routed. A folder starting with `_` is private in the App Router, so nothing here is
served, but it is still type-checked and linted. The live UI after onboarding is the Plan Hub
(`components/hub/`, routes `/home` and `/papers`); the old URLs redirect there
(`next.config.ts`).

To bring a page back, `git mv` its folder (and this `layout.tsx`, which wraps it in the old
sidebar shell) back under `app/(opendoor)/(app)/`, and remove its redirect.
