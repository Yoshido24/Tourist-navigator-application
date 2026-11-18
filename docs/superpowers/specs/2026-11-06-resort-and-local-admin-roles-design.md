# Resort and Local Admin Roles

## Intent

Distribute tourism operations by barangay while keeping municipal oversight.
Resort owners need a way to submit and manage their resort listings, and
tourists need their requests to reach the person responsible for that place.

## Roles and responsibilities

- **Municipal Super Admin**: the existing Admin dashboard becomes the
  municipality-wide oversight portal. Super Admins manage Barangay Admin
  accounts and their barangay assignments, approve Resort Manager accounts,
  retain global booking oversight and guide assignment, and can intervene in
  any resort listing review. Existing municipal management tools remain.
- **Barangay Admin**: a new, separate portal. Each account is assigned one or
  more barangays by a Super Admin, with exactly one Barangay Admin assigned
  per barangay. It handles attraction bookings and guide assignments only
  within its assigned area, and reviews resort listings and edits for that
  area.
- **Resort Manager**: a new, separate portal. Managers sign up, submit resort
  information and service fees for municipal account approval, then manage
  only their own reviewed listings and incoming resort requests. The portal
  is a mobile-first web app usable from phones and computers.
- **Guide and Tourist**: existing experiences remain separate and continue to
  work as before.

## Main flows

### Resort listing

1. A manager self-registers with resort details and one or more services and
   fees, including the resort's barangay.
2. The Municipal Super Admin approves or rejects the owner account. A pending
   or rejected owner cannot manage a listing or bookings.
3. Approval creates the owner's private initial listing submission. The
   assigned Barangay Admin reviews it; Municipal Super Admins can intervene.
4. Only approved resort listings and service fees appear publicly. Every edit
   returns to barangay review while the previous approved version remains
   visible and bookable.

### Bookings

- An attraction booking is routed using the attraction's barangay to a
  Barangay Admin assigned to that area. That admin processes the request.
- Resorts can list day visits/entrance, cottages/facilities, overnight stays,
  and activities/other services, with a fee and pricing unit for each.
- A tourist sends a request for one published service, a visit date or (for
  overnight stays) check-in/check-out dates, guest count, and contact details.
  The server resolves the service and fee from the approved resort listing and
  routes the request to that resort's manager.
- The resort manager accepts or declines their own pending requests; these
  decisions are `Approved` and `Rejected`.
- The resort manager confirms availability manually. There is no room
  inventory, payment, or automatic availability confirmation in this scope.
- Municipal Super Admins can view and control bookings across all areas;
  attraction requests remain with the assigned Barangay Admin and resort
  requests remain with the resort manager.

## Access and data boundaries

Use the existing Supabase Auth foundation, but make role and scope checks
server-enforced through database policies and trusted server-side code. Do not
rely on hiding dashboard controls. A user must not be able to grant themselves
an admin role, change their barangay assignment, approve a resort, view another
manager's private submissions, or act on bookings outside their scope.

Resort listings need an owner and review status, with an approved version
separate from edits awaiting review. Barangay Admin accounts need an assigned
barangay scope. Each barangay has one assigned Barangay Admin for its
attraction booking queue. Booking records need an unambiguous target type and
target ID so the server can route attraction bookings by barangay and resort
bookings by owner. Public reads must exclude resorts without an approved
version.

## Goals

- Split municipal oversight from day-to-day barangay attraction booking work.
- Let municipal admins approve resort owner accounts and barangay admins
  review local resort listings and service fees.
- Route requests to the correct local administrator or resort manager.
- Enforce account ownership and geography at the data layer.
- Preserve the current guide and tourist workflows unless directly affected by
  resort discovery and booking.

## Not in scope

- Resort room, rate, or live availability inventory.
- Online payments, refunds, or automatic confirmations.
- Municipal and barangay co-approval of the same resort listing.
- Changes to guide registration, assignment, or guide booking workflows.

## Implementation calls

- Reuse the current Admin dashboard for the Municipal Super Admin rather than
  replacing its global tools.
- Create distinct entry points for Barangay Admin and Resort Manager portals.
- Have the Super Admin create Barangay Admin accounts and assign their scope;
  allow managers to self-register, but grant manager access only after
  Municipal approval.
- Keep each barangay's attraction booking queue assigned to a single Barangay
  Admin; Super Admins can intervene across all queues and resort reviews.
- Use a separate resort listing model rather than treating a resort as an
  attraction, because owner access, approval, services, and booking dates differ.
- Resolve each requested service and its fee from the published resort record;
  never trust client-sent prices.
- Review every resort edit while continuing to show the last approved version
  publicly until the replacement is approved.
- No existing resort records were found in the repository, so the initial
  launch does not need to migrate resort listings.
