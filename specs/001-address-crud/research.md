# Phase 0 Research: Address CRUD

## 1. Default Address Invariant Management

### Context & Requirements
Under functional requirements FR-009, FR-010, FR-011, FR-012, and success criteria SC-003:
- Each user MUST have at most one default address at any time.
- If a user has 1 or more addresses, exactly one MUST be marked as default.
- If a user has 0 addresses, 0 defaults exist.
- Creating the first address for a user MUST automatically mark it as default (`isDefault: true`), regardless of what was passed in the request body.
- Creating or updating an address with `isDefault: true` MUST demote any existing default address for that user to `isDefault: false`.
- If a user attempts to update their default address to `isDefault: false`:
  - When the user has multiple addresses, this request is ambiguous (which other address should become default?). The system must reject the operation with `400 Bad Request` and descriptive error: `"Cannot unset default status on the default address while multiple addresses exist. Designate another address as default instead."`
  - When the user has only 1 address, unsetting default is rejected with `400 Bad Request`: `"The only saved address must remain the default address."`
- When deleting an address:
  - If the deleted address is NOT the default address, simply delete it.
  - If the deleted address IS the default address:
    - If other addresses remain, automatically promote the most recently created remaining address (`orderBy: { createdAt: 'desc' }`) to `isDefault: true`.
    - If no other addresses remain, delete the address; the user now has 0 addresses and 0 defaults.

### Decision
Implement all default-mutating workflows within Prisma interactive transactions (`prisma.$transaction(async (tx) => { ... })`).
- **Create**:
  1. Count existing addresses for user.
  2. If count === 0, force `isDefault = true`.
  3. If `isDefault === true` and count > 0, execute `tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } })`.
  4. Create the new address with resolved `isDefault`.
- **Update**:
  1. Fetch existing address scoped by `id` and `userId`.
  2. If setting `isDefault = false` when it was currently `true`:
     - Count total user addresses.
     - Reject with `BadRequestException` (400) if count >= 1.
  3. If setting `isDefault = true` when it was currently `false`:
     - Demote current default: `tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } })`.
  4. Update the target address.
- **Delete**:
  1. Fetch existing address scoped by `id` and `userId`.
  2. Delete target address.
  3. If deleted address was default:
     - Find the most recent remaining address: `tx.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })`.
     - If found, update it: `tx.address.update({ where: { id: nextDefault.id }, data: { isDefault: true } })`.

### Rationale
- Using Prisma interactive transactions guarantees serializability and atomic execution, preventing race conditions (such as concurrent creates or updates leaving multiple defaults or zero defaults).
- Deterministic auto-promotion of the most recent address on default deletion fulfills FR-012 and SC-003 without requiring extra round-trips from the client.
- Rejecting explicit default demotion with a clear 400 status prevents inconsistent address book states while providing actionable guidance to API consumers.

### Alternatives Considered
- *Auto-promoting a random address on explicit `isDefault: false` update*: Rejected because it changes user defaults unexpectedly without user intent.
- *Background cron/reconciliation worker*: Rejected as needlessly complex for an interactive CRUD domain.

---

## 2. Address Label Enum & Schema Alignment

### Decision
Reuse the existing PostgreSQL and Prisma enum `AddressType` (`home`, `office`, `other`) defined in `prisma/schema.prisma` and already migrated in `0_init/migration.sql`.

### Rationale
- Constitution Principle III dictates reusing existing modules, models, and types whenever responsibilities match.
- `spec.md` FR-002 explicitly specifies: "Address labels MUST be limited to home, office, or other."
- The `AddressType` enum in `prisma/schema.prisma` is:
  ```prisma
  enum AddressType {
    home
    office
    other
  }
  ```
- DTO validation will enforce `@IsEnum(AddressType)` to ensure compile-time strictness and runtime request validation (Constitution Principle II).

### Alternatives Considered
- *Arbitrary string label with custom validation regex*: Rejected because the database already defines `AddressType` enum, and open-ended strings violate FR-002.

---

## 3. Ownership Scoping & Security Posture

### Decision
Enforce strict user ownership scoping at the database query level on every operation, combined with uniform `404 Not Found` handling for unauthorized access attempts.

### Rationale
- Constitution Principle VI and Spec FR-007 / SC-002 mandate that users must not view or mutate other users' addresses, and that attempts must fail without revealing whether the ID exists for another user.
- All single-resource operations (`findById`, `update`, `delete`) query Prisma with `{ where: { id, userId } }`.
- If no record matches the combined `{ id, userId }` predicate, throw `NotFoundException('Address not found')`.
- This completely prevents ID enumeration / metadata leakage across accounts.

### Alternatives Considered
- *Returning 403 Forbidden when address exists for another user*: Rejected because a 403 response confirms that the target ID exists in the database, enabling ID-harvesting and account probing.

---

## 4. Foreign Key Constraints & Historical Order References

### Context
In `prisma/schema.prisma`, `Order` has:
```prisma
shippingAddressId Int?
shippingFullName String
shippingPhone String
shippingStreet String
...
shippingAddress Address? @relation(fields: [shippingAddressId], references: [id])
```
In database migration `0_init/migration.sql` line 536:
`ALTER TABLE "Order" ADD CONSTRAINT "Order_shippingAddressId_fkey" FOREIGN KEY ("shippingAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;`

### Decision
1. Update `prisma/schema.prisma` to explicitly declare `onDelete: SetNull` on `shippingAddress Address? @relation(fields: [shippingAddressId], references: [id], onDelete: SetNull)`.
2. Add `@@index([userId])` to `model Address` in `prisma/schema.prisma` to optimize the frequent `WHERE "userId" = $1` queries.
3. In `AddressService.delete()`, deleting the address record will smoothly cascade to `SET NULL` on `Order.shippingAddressId` while leaving all historical snapshot columns on `Order` intact, matching Spec Assumption line 130 and Edge Cases line 85.

### Rationale
- Keeps Prisma's in-memory relational semantics identical to the PostgreSQL schema.
- Guarantees historical order integrity without requiring soft-delete complexity in the address book.

### Alternatives Considered
- *Soft-delete (`deletedAt` column)*: Rejected because the specification mandates address deletion ("removes an address they no longer need") and order snapshots already capture the complete historical address text. Soft-delete would add unnecessary complexity to unique default logic.

---

## 5. Input Validation & DTO Constraints

### Decision
Define rigorous class-validator rules on `CreateAddressDto` and `UpdateAddressDto`:
- `label`: `@IsEnum(AddressType)`, required.
- `fullName`: `@IsString()`, `@IsNotEmpty()`, `@MaxLength(100)`, `@Transform(({ value }) => value?.trim())`.
- `phone`: `@IsString()`, `@IsNotEmpty()`, `@MaxLength(20)`, `@Matches(/^[+0-9\s\-()]{7,20}$/, { message: 'Phone number format is invalid' })`.
- `street`: `@IsString()`, `@IsNotEmpty()`, `@MaxLength(255)`, `@Transform(({ value }) => value?.trim())`.
- `city`: `@IsString()`, `@IsNotEmpty()`, `@MaxLength(100)`, `@Transform(({ value }) => value?.trim())`.
- `province`: `@IsString()`, `@IsNotEmpty()`, `@MaxLength(100)`, `@Transform(({ value }) => value?.trim())`.
- `postalCode`: `@IsString()`, `@IsNotEmpty()`, `@MaxLength(20)`, `@Transform(({ value }) => value?.trim())`.
- `country`: `@IsString()`, `@IsNotEmpty()`, `@MaxLength(100)`, `@Transform(({ value }) => value?.trim())`.
- `isDefault`: `@IsBoolean()`, `@IsOptional()`.

For `UpdateAddressDto`, use `PartialType(CreateAddressDto)` from `@nestjs/swagger`.

### Rationale
- Fulfills FR-013 ("Address create and update MUST reject incomplete or invalid input before persisting").
- Trimming prevents whitespace-only bypasses.
- Max lengths protect against resource exhaustion and database errors.
