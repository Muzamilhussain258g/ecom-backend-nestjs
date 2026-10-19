# Tasks: Address CRUD

**Feature**: Address CRUD  
**Branch**: `001-address-crud`  
**Input Documents**: [spec.md](file:///c:/Users/User/Desktop/backends/ecom-backend-nestjs/specs/001-address-crud/spec.md), [plan.md](file:///c:/Users/User/Desktop/backends/ecom-backend-nestjs/specs/001-address-crud/plan.md), [data-model.md](file:///c:/Users/User/Desktop/backends/ecom-backend-nestjs/specs/001-address-crud/data-model.md), [contracts/address-api.yaml](file:///c:/Users/User/Desktop/backends/ecom-backend-nestjs/specs/001-address-crud/contracts/address-api.yaml), [research.md](file:///c:/Users/User/Desktop/backends/ecom-backend-nestjs/specs/001-address-crud/research.md), [quickstart.md](file:///c:/Users/User/Desktop/backends/ecom-backend-nestjs/specs/001-address-crud/quickstart.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Update schema definitions and initialize module structure.

- [x] T001 Update Prisma schema in `prisma/schema.prisma` to declare `onDelete: SetNull` on `Order.shippingAddress` relation and add `@@index([userId])` on `model Address`
- [x] T002 Run Prisma generate to update `@prisma/client` types in `generated/prisma/client`
- [x] T003 [P] Create `AddressModule` scaffold in `src/address/address.module.ts` importing `PrismaModule`
- [x] T004 Register `AddressModule` in root `AppModule` imports array in `src/app.module.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core DTOs, select projections, and service/controller scaffolds that MUST be complete before user story implementation begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 [P] Create address response DTO and safe serialization contract in `src/address/dto/address-response.dto.ts` exposing `id`, `userId`, `label`, `fullName`, `phone`, `street`, `city`, `province`, `postalCode`, `country`, `isDefault`, and `createdAt`
- [x] T006 [P] Define Prisma select projection constant `addressSelect` matching safe response fields in `src/address/address.service.ts`
- [x] T007 Scaffold `AddressController` in `src/address/address.controller.ts` with `@Controller('addresses')`, `@UseGuards(JwtAuthGuard)`, and `@ApiTags('Addresses')`, `@ApiBearerAuth('JWT-auth')`
- [x] T008 Scaffold `AddressService` in `src/address/address.service.ts` injecting `PrismaService`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Save a Shipping Address (Priority: P1) 🎯 MVP

**Goal**: Authenticated shoppers can add a new shipping address. If it is their first address, it automatically becomes the default; adding a new address marked as default automatically demotes the existing default address.

**Independent Test**: Sign in, POST a complete address to `/api/v1/addresses` for a user with no addresses and confirm `isDefault: true`; POST a second address without default and confirm `isDefault: false`; POST a third address with `isDefault: true` and confirm it becomes default while the first is demoted.

### Tests for User Story 1

- [x] T009 [P] [US1] Implement unit tests for `AddressService.create` in `src/address/address.service.spec.ts` testing first-address auto-default assignment, secondary address creation without default, and default promotion/demotion

### Implementation for User Story 1

- [x] T010 [P] [US1] Create `CreateAddressDto` in `src/address/dto/create-address.dto.ts` with verbatim constraints: `label` as `@IsEnum(AddressType)` ("home", "office", "other"), `fullName` as `@IsString()`, `@IsNotEmpty()`, `@MaxLength(100)`, trimmed, `phone` as `@IsString()`, `@IsNotEmpty()`, `@MaxLength(20)`, `@Matches(/^[+0-9\s\-()]{7,20}$/)`, `street` as `@IsString()`, `@IsNotEmpty()`, `@MaxLength(255)`, trimmed, `city` as `@IsString()`, `@IsNotEmpty()`, `@MaxLength(100)`, trimmed, `province` as `@IsString()`, `@IsNotEmpty()`, `@MaxLength(100)`, trimmed, `postalCode` as `@IsString()`, `@IsNotEmpty()`, `@MaxLength(20)`, trimmed, `country` as `@IsString()`, `@IsNotEmpty()`, `@MaxLength(100)`, trimmed, and `isDefault` as `@IsBoolean()`, `@IsOptional()`
- [x] T011 [US1] Implement `AddressService.create` in `src/address/address.service.ts` using `prisma.$transaction` to atomically enforce first-address auto-default when count is 0 and demote existing default when `isDefault: true`
- [x] T012 [US1] Implement `create` endpoint (`POST /api/v1/addresses`) in `src/address/address.controller.ts` with `@CurrentUser()`, `@Body()`, `@HttpCode(HttpStatus.CREATED)`, and `@ResponseMessage('Address created successfully')`

**Checkpoint**: User Story 1 is fully functional and independently testable (MVP complete).

---

## Phase 4: User Story 2 - View and Open Saved Addresses (Priority: P1)

**Goal**: Authenticated shoppers can retrieve all of their saved addresses or fetch a specific address by ID; attempts to access another user's address return 404 without leaking existence.

**Independent Test**: Sign in, fetch all addresses via `GET /api/v1/addresses` and confirm only the authenticated user's addresses are returned; fetch single address by ID via `GET /api/v1/addresses/:id`; request an unowned or non-existent address ID and confirm a uniform 404 Not Found response.

### Tests for User Story 2

- [x] T013 [P] [US2] Implement unit tests for `AddressService.findAll` and `AddressService.findById` in `src/address/address.service.spec.ts` testing user-scoped list retrieval, single address retrieval, and `NotFoundException` on unowned/nonexistent ID

### Implementation for User Story 2

- [x] T014 [US2] Implement `AddressService.findAll` and `AddressService.findById` in `src/address/address.service.ts` querying with `where: { userId }` ordered by `createdAt: 'desc'`, and single lookup querying `where: { id, userId }` throwing `NotFoundException('Address not found')` if not found
- [x] T015 [US2] Implement `findAll` (`GET /api/v1/addresses`) and `findById` (`GET /api/v1/addresses/:id`) in `src/address/address.controller.ts` with `ParseIntPipe`, `@ResponseMessage('Addresses fetched successfully')`, and `@ResponseMessage('Address fetched successfully')`

**Checkpoint**: User Stories 1 and 2 are fully functional and independently testable.

---

## Phase 5: User Story 3 - Update a Shipping Address (Priority: P2)

**Goal**: Authenticated shoppers can update address fields on an owned address and switch default status; attempting to unset default status directly when multiple addresses exist or when only 1 address exists is rejected with 400 Bad Request; unowned address updates return 404.

**Independent Test**: Send `PATCH /api/v1/addresses/:id` with new street or phone and verify the change; send PATCH with `isDefault: true` on a non-default address and verify previous default is cleared; attempt PATCH with `isDefault: false` on the current default address and verify 400 Bad Request rejection.

### Tests for User Story 3

- [x] T016 [P] [US3] Implement unit tests for `AddressService.update` in `src/address/address.service.spec.ts` testing field updates, default promotion, demotion rejection (400) when unsetting default on default address, and 404 on unowned ID

### Implementation for User Story 3

- [x] T017 [P] [US3] Create `UpdateAddressDto` in `src/address/dto/update-address.dto.ts` extending `PartialType(CreateAddressDto)`
- [x] T018 [US3] Implement `AddressService.update` in `src/address/address.service.ts` within `prisma.$transaction` checking address ownership via `{ id, userId }`, rejecting `isDefault: false` on current default with `BadRequestException`, and demoting existing default when `isDefault: true`
- [x] T019 [US3] Implement `update` endpoint (`PATCH /api/v1/addresses/:id`) in `src/address/address.controller.ts` with `ParseIntPipe`, `@Body() dto: UpdateAddressDto`, and `@ResponseMessage('Address updated successfully')`

**Checkpoint**: User Stories 1, 2, and 3 are fully functional and independently testable.

---

## Phase 6: User Story 4 - Delete a Shipping Address (Priority: P2)

**Goal**: Authenticated shoppers can delete an owned address; if the deleted address was default, the system automatically promotes the most recently created remaining address to default; deleting the last address leaves 0 addresses and 0 defaults; unowned deletions return 404; historical order shipping snapshots remain intact while `Order.shippingAddressId` is set to null.

**Independent Test**: Delete an owned non-default address and verify removal from address list; delete the default address when other addresses remain and verify the latest remaining address becomes default; delete the last remaining address and verify an empty address list; attempt deletion of an unowned address and verify 404.

### Tests for User Story 4

- [x] T020 [P] [US4] Implement unit tests for `AddressService.remove` in `src/address/address.service.spec.ts` testing non-default deletion, default deletion with auto-promotion of most recent remaining address, last address deletion, and 404 on unowned ID

### Implementation for User Story 4

- [x] T021 [US4] Implement `AddressService.remove` in `src/address/address.service.ts` within `prisma.$transaction` checking ownership, deleting record, and if deleted address was default and remaining addresses exist, updating latest remaining address (`orderBy: { createdAt: 'desc' }`) to `isDefault: true`
- [x] T022 [US4] Implement `remove` endpoint (`DELETE /api/v1/addresses/:id`) in `src/address/address.controller.ts` with `ParseIntPipe` returning `{ id }` and `@ResponseMessage('Address deleted successfully')`

**Checkpoint**: All user stories (US1 through US4) are fully functional and independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Complete test coverage, API documentation, formatting, and end-to-end quickstart validation.

- [x] T023 [P] Implement comprehensive unit tests for `AddressController` in `src/address/address.controller.spec.ts` verifying HTTP status codes (201, 200), pipe transformations, response messages, and service delegation
- [x] T024 Enhance Swagger documentation on `AddressController` in `src/address/address.controller.ts` with `@ApiOperation`, `@ApiResponse` (200, 201, 400, 401, 404), and DTO schemas matching `contracts/address-api.yaml`
- [x] T025 Run linter and formatting across `src/address/` and `prisma/schema.prisma` via `npm run lint` and `npm run format`
- [x] T026 Execute test suite (`npm run test -- src/address`) and validate all scenarios from `specs/001-address-crud/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 completion - BLOCKS all user stories.
- **User Story 1 (Phase 3 - P1 🎯 MVP)**: Depends on Phase 2. Can proceed immediately.
- **User Story 2 (Phase 4 - P1)**: Depends on Phase 2. Can proceed in parallel with or after US1.
- **User Story 3 (Phase 5 - P2)**: Depends on Phase 2. Builds upon addresses created in US1/US2.
- **User Story 4 (Phase 6 - P2)**: Depends on Phase 2. Builds upon addresses created in US1/US2.
- **Polish (Phase 7)**: Depends on US1-US4 completion.

### User Story Dependencies

```
[Phase 1: Setup]
       │
       ▼
[Phase 2: Foundational]
       │
       ├──────────────────────────────┐
       ▼                              ▼
[Phase 3: US1 - Create (P1)]   [Phase 4: US2 - Read (P1)]
       │                              │
       └──────────────┬───────────────┘
                      │
       ├──────────────┴──────────────┐
       ▼                             ▼
[Phase 5: US3 - Update (P2)]   [Phase 6: US4 - Delete (P2)]
       │                             │
       └──────────────┬──────────────┘
                      │
                      ▼
            [Phase 7: Polish]
```

### Parallel Opportunities

- **Setup Tasks**: `T003` can be scaffolded in parallel with `T001`/`T002`.
- **Foundational Tasks**: `T005` and `T006` can be created in parallel.
- **User Story 1 Tasks**: `T009` (unit tests) and `T010` (CreateAddressDto) can run in parallel before service implementation `T011`.
- **User Story 2 Tasks**: `T013` (unit tests) can run in parallel with controller scaffolding.
- **User Story 3 Tasks**: `T016` (unit tests) and `T017` (UpdateAddressDto) can run in parallel before service implementation `T018`.
- **User Story 4 Tasks**: `T020` (unit tests) can run before or in parallel with service implementation `T021`.
- **Polish Tasks**: `T023` (controller tests) and `T024` (Swagger docs) can run in parallel.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (`T001` - `T004`).
2. Complete Phase 2: Foundational (`T005` - `T008`).
3. Complete Phase 3: User Story 1 (`T009` - `T012`).
4. **STOP and VALIDATE**: Run User Story 1 independent test criteria (create first address, verify auto-default, add second address, add third address with default and verify demotion).

### Incremental Delivery

1. Setup + Foundation → Core plumbing ready.
2. User Story 1 (Create) → Shoppers can save addresses (MVP).
3. User Story 2 (List / Get) → Shoppers can view their address book.
4. User Story 3 (Update) → Shoppers can correct mistakes and re-assign default address.
5. User Story 4 (Delete) → Shoppers can delete addresses with automatic default promotion.
6. Polish & Hardening → Full test suite passes, Swagger verified, quickstart scenarios confirmed.
