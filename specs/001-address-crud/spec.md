# Feature Specification: Address CRUD

**Feature Branch**: `001-address-crud`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Address CRUD user shipping addresses according to structure"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save a shipping address (Priority: P1)

A signed-in shopper adds a new shipping address so they can reuse it later at checkout instead of typing full details every time.

**Why this priority**: Without create + list, checkout cannot rely on saved addresses. This is the minimum useful slice.

**Independent Test**: Sign in, create one complete address, then open the address list and confirm it appears with the saved details.

**Acceptance Scenarios**:

1. **Given** a signed-in user with no saved addresses, **When** they submit a valid shipping address (label, recipient name, phone, street, city, province, postal code, country, and whether it is default), **Then** the address is saved and returned to them.
2. **Given** a signed-in user creating their first address, **When** they do not mark it as default, **Then** the system still treats it as the default because it is their only address.
3. **Given** a signed-in user who already has a default address, **When** they create a new address marked as default, **Then** the new address becomes the only default and the previous default is cleared.
4. **Given** an unauthenticated visitor, **When** they try to create an address, **Then** they are denied access.

---

### User Story 2 - View and open saved addresses (Priority: P1)

A signed-in shopper views all of their saved shipping addresses and can open one by id to confirm details before checkout or edit.

**Why this priority**: Users must see what they saved; list/get completes basic CRUD usability with create.

**Independent Test**: With at least two saved addresses, list them and fetch one by id; confirm only that user’s addresses are returned.

**Acceptance Scenarios**:

1. **Given** a signed-in user with multiple addresses, **When** they request their address list, **Then** they see only their own addresses, including label, recipient, contact, location fields, default flag, and when each was created.
2. **Given** a signed-in user, **When** they request one of their addresses by id, **Then** they receive the full details for that address.
3. **Given** a signed-in user, **When** they request an address id that belongs to another user or does not exist, **Then** they receive a not-found style denial without learning whether the id exists for someone else.

---

### User Story 3 - Update a shipping address (Priority: P2)

A signed-in shopper corrects or changes an existing saved address (for example phone or street) and can change which address is the default.

**Why this priority**: Corrections are common before checkout; needed after create/list work.

**Independent Test**: Update fields on an owned address and confirm the list/get reflect the new values; set another address as default and confirm only one remains default.

**Acceptance Scenarios**:

1. **Given** a signed-in user and an address they own, **When** they submit valid updated fields, **Then** those fields are persisted and returned.
2. **Given** a signed-in user with multiple addresses, **When** they mark a non-default address as default, **Then** that address becomes default and any previous default is cleared.
3. **Given** a signed-in user, **When** they try to update an address they do not own, **Then** the update is rejected as not found / not allowed.

---

### User Story 4 - Delete a shipping address (Priority: P2)

A signed-in shopper removes an address they no longer need.

**Why this priority**: Completes CRUD; important for privacy and decluttering, but checkout can work without delete if create/list/update exist.

**Independent Test**: Delete an owned address and confirm it no longer appears in the list; attempting to get it again fails.

**Acceptance Scenarios**:

1. **Given** a signed-in user and an address they own that is not the only address, **When** they delete it, **Then** it is removed from their list.
2. **Given** a signed-in user whose default address is deleted while other addresses remain, **When** deletion succeeds, **Then** another remaining address becomes the default (prefer the most recently created remaining address unless a clearer rule is configured).
3. **Given** a signed-in user with only one address, **When** they delete it, **Then** the address is removed and they have no default address until they add another.
4. **Given** a signed-in user, **When** they try to delete an address they do not own, **Then** the deletion is rejected as not found / not allowed.

---

### Edge Cases

- Required fields missing or blank → rejected with clear validation feedback; nothing is saved.
- Invalid label (not home, office, or other) → rejected.
- Extremely long text in name/street/city fields → rejected by length limits.
- Setting `isDefault` to false on the only remaining default while other addresses exist → system keeps exactly one default (either reject the change or auto-promote another address).
- Address linked to past orders → deletion is still allowed for the saved-address book; historical order shipping snapshots remain unchanged on those orders.
- Concurrent default changes from two requests → system ends with exactly one default address for that user.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Authenticated users MUST be able to create a shipping address with label, full name, phone, street, city, province, postal code, country, and default flag.
- **FR-002**: Address labels MUST be limited to home, office, or other.
- **FR-003**: Users MUST be able to list all shipping addresses that belong to them.
- **FR-004**: Users MUST be able to retrieve a single shipping address they own by its identifier.
- **FR-005**: Users MUST be able to update fields on a shipping address they own.
- **FR-006**: Users MUST be able to delete a shipping address they own.
- **FR-007**: Users MUST NOT create, read, update, or delete another user’s addresses.
- **FR-008**: Unauthenticated requests to address management MUST be denied.
- **FR-009**: Each user MUST have at most one default shipping address at any time.
- **FR-010**: Creating the first address for a user MUST result in that address being default.
- **FR-011**: Creating or updating an address as default MUST clear the default flag on any other address for that user.
- **FR-012**: Deleting the current default when other addresses remain MUST leave exactly one default among the remaining addresses.
- **FR-013**: Address create and update MUST reject incomplete or invalid input before persisting.
- **FR-014**: Address responses MUST expose only address book fields needed by the client (identifier, label, recipient and contact details, location fields, default flag, created time) and MUST NOT expose secrets or other users’ data.

### Key Entities

- **Shipping Address**: A reusable delivery destination owned by one user, including a label (home/office/other), recipient name, phone, street, city, province, postal code, country, default flag, and creation time.
- **User**: The authenticated account that owns zero or more shipping addresses; ownership scopes all address operations.
- **Order (reference only)**: May reference a shipping address historically; this feature manages the address book, not order placement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user can save a new shipping address and see it in their list in under 1 minute without leaving the address-management flow.
- **SC-002**: 100% of address list/get/update/delete attempts against another user’s address identifiers fail without revealing that user’s data.
- **SC-003**: After any successful create, update, or delete that affects defaults, a user’s address book always has either zero addresses or exactly one default address.
- **SC-004**: At least 95% of users completing the “add address” task succeed on the first valid submission (no unexplained server failures on valid input).
- **SC-005**: Users can correct a mistaken phone or street on an existing address and confirm the change on reload without creating a duplicate address.

## Assumptions

- Existing user sign-in is reused; this feature does not define registration or login.
- Address management is for signed-in users only; guest checkout address entry is out of scope for this feature.
- Labels are restricted to home, office, and other to match the established address structure.
- Country and phone formats are stored as provided text with reasonable length limits; deep international address validation (postal APIs, geocoding) is out of scope for v1.
- Admin/seller roles do not receive a special cross-user address admin UI in this feature; they manage only their own addresses like any authenticated user unless a later admin feature is specified.
- Past orders keep their own shipping snapshot fields; deleting a saved address does not rewrite historical orders.
- Cart and checkout flows may consume saved addresses later; placing an order is out of scope for this specification.
