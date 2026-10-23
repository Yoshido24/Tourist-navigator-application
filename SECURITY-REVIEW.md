# Security review

Scope: Supabase RLS and grants, the sign-up trigger, the Edge Functions, and the shared frontend state code.

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | MEDIUM | backend/database/security-lockdown.sql | 93, 105-107 | A guide can edit any column of an assigned booking, not only `status` | 9/10 |

## Finding 1: guide can edit every column of assigned bookings

`authenticated` has a table-wide `UPDATE` grant on `public.bookings`. The guide RLS policy limits which rows a guide can update (`guide_id` is theirs) and keeps `guide_id` unchanged. It does not limit which columns they change. A guide sending a direct PostgREST update can alter the traveler's contact, date, party size, notes, status or `assignedGuide`.

Suggested fix: a BEFORE UPDATE trigger on `bookings` that, for non-admin users, rejects any change outside `status`. A column-level grant would not work because admins use the same `authenticated` role.

Status: open, not fixed.

## No other issues found

The reviewer checked for self-approval through sign-up metadata, anonymous reads, guides editing their own row, and privilege escalation. None were found.
