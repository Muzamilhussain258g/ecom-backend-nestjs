<!--
Sync Impact Report (review scratch material; remove before committing)
Version change: unratified scaffold -> 1.0.0 (initial adoption)
Modified principles: five unnamed template slots replaced by ten project principles.
Added principles: I-X below.
Added sections: Technical Constraints; Development Workflow and Quality Gates;
completed Governance.
Removed sections: none; template placeholders and example comments replaced.
Deferred placeholders: none.
Existing-code follow-up: Passport is not installed and compiler strictness is incomplete;
address these gaps through separately scoped implementation work.
Dependent templates and commands: unchanged; constitution is read at runtime.
-->

# Ecom Backend Personal Constitution

## Core Principles

### I. NestJS Modular Architecture

Features MUST follow NestJS module boundaries and dependency injection. Controllers MUST
handle HTTP concerns, services MUST own business logic, and database access MUST use the
existing Prisma service. Cross-module dependencies MUST use explicit imports and exports.
New circular dependencies MUST NOT be introduced. This keeps responsibilities testable.

### II. TypeScript Strict Typing

Application changes MUST use strict TypeScript typing at DTO, service, strategy, and request
boundaries. Untrusted inputs MUST be validated or narrowed before use. New implicit or
explicit `any` types and unchecked assertions MUST NOT bypass type safety. Compiler
strictness MUST NOT be weakened. Existing settings that disable strict checks MUST be
identified in affected plans and migrated through scoped work; changed code MUST meet
these typing rules in the meantime.

### III. Reuse Existing Modules, Services, and DTOs

Changes MUST reuse or extend existing modules, services, and DTOs when their responsibilities
match the requirement. Duplicate business logic, validation, token handling, and persistence
access MUST NOT be introduced. New abstractions MUST have a distinct responsibility that
cannot be met by existing abstractions without violating module boundaries.

### IV. Passport Authentication Strategies

New or refactored authentication strategies MUST use Passport.js through NestJS integration.
Strategies MUST validate credentials or tokens and return a safe authenticated principal.
Guards MUST apply strategies to protected routes. Authentication logic MUST NOT be duplicated
in controllers. Existing custom authentication MUST migrate through scoped feature work that
preserves existing API contracts.

### V. JWT Access-Token Authentication

Protected API routes MUST authenticate JWT access tokens through a Passport JWT strategy.
Verification MUST check signatures, expiration, allowed signing algorithms, the expected
access-token type, and subject validity before loading the user. Refresh tokens MUST NOT
grant access to protected routes. Missing or invalid credentials and missing users MUST
produce `401`. Token issuance and refresh lifecycle logic MUST reuse existing services.

### VI. Role-Based Authorization

Routes requiring role restrictions MUST declare allowed roles and enforce them using the
existing role decorator and guard. Authentication MUST run before role checks. Authorization
MUST use the authenticated user's current database role rather than client-provided roles
or stale token claims. Authenticated users lacking a required role MUST receive `403`.
Existing resource ownership checks MUST remain enforced.

### VII. Secure Password Hashing

Passwords MUST be hashed before persistence using the existing bcrypt implementation with
a fresh salt and a work factor of at least 10. Verification MUST use the library comparison
function. Plaintext passwords and reversible password encryption MUST NOT be stored.
Hashing parameters MUST NOT be weakened. Changes MUST preserve verification of existing
hashes and account for the algorithm's input limits.

### VIII. Safe API Responses

API responses MUST NOT expose passwords, password hashes, refresh-token hashes, signing
keys, database credentials, or internal secrets. User data returned to clients MUST use
explicit safe field selections or safe response mapping. Error responses MUST NOT expose
credentials or secret-bearing configuration. Access and refresh tokens MAY be returned by
existing authentication endpoints according to their established client contracts.

### IX. Environment-Based Secrets

Secrets MUST be supplied through environment variables and accessed through NestJS
configuration. Required secrets MUST fail configuration or provider initialization when
absent. Hardcoded secrets and insecure fallback values MUST NOT be used. Secret values
MUST NOT be committed or logged. Example environment files MUST use placeholders only.

### X. Existing API Contract Compatibility

Changes MUST preserve endpoint paths, HTTP methods, request validation, response shapes,
status codes, and authentication workflows. Authentication refactoring MUST preserve the
safe `request.user` shape consumed by existing decorators and controllers. Intentional
breaking changes MUST be explicitly approved and planned with a versioned contract and
client migration before implementation. Relevant tests MUST verify compatibility.

## Technical Constraints

The project is an existing NestJS backend using TypeScript, Prisma, and PostgreSQL.
Implementation MUST integrate with existing modules, DTO validation, Prisma models, token
services, and authorization guards. Database schema changes MUST be justified by feature
requirements and use Prisma migrations. Authentication refactoring alone MUST NOT introduce
unrelated schema changes or a new application framework.

## Development Workflow and Quality Gates

Specifications and plans MUST identify affected modules, API contracts, security behavior,
and existing gaps against this constitution. Constitution checks MUST occur during planning
and review. Unresolved violations MUST block completion unless an explicit, scoped exception
is approved and documented with remediation.

Changed code MUST pass the build and relevant tests. Authentication and authorization
changes MUST verify valid access, missing and invalid credentials, expiration, refresh-token
rejection, missing users, current roles, and forbidden access. Relevant API tests MUST
verify safe response fields and compatibility. Required check results MUST be recorded;
unavailable or failing checks MUST be reported.

Existing gaps MUST be addressed through scoped feature work. Ratification does not imply
that the current implementation already complies with every principle.

## Governance

This constitution governs specifications, plans, implementation, and review. Amendments MUST
state their rationale, affected principles, compatibility impact, and migration requirements,
and receive project-maintainer approval. The constitution version and amendment date MUST
be updated. The initial ratification date MUST be preserved.

Versioning MUST follow semantic versioning: MAJOR for incompatible principle removals or
redefinitions, MINOR for new principles or materially expanded guidance, and PATCH for
clarifications that do not change obligations. Every change review MUST check compliance.
Exceptions MUST be explicit, scoped, approved, and accompanied by a remediation plan.
Dependent templates and commands read this constitution at runtime and MUST NOT be modified
as part of the constitution workflow.

**Version**: 1.0.0 | **Ratified**: 2026-10-12 | **Last Amended**: 2026-10-12
