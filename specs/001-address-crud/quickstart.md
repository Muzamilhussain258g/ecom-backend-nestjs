# Quickstart Validation Guide: Address CRUD

## Overview
This quickstart provides executable curl-based scenarios to validate the implementation of the Address CRUD feature end-to-end against a running backend service.

---

## Prerequisites

1. **Environment Setup**:
   - Ensure the PostgreSQL database is running.
   - Run existing migrations and seeds if needed:
     ```bash
     npx prisma generate
     ```
   - Start the NestJS development server:
     ```bash
     npm run start:dev
     ```
   - The API will be available at `http://localhost:3000/api/v1`.

2. **Authentication Token**:
   - Obtain a valid JWT access token for a customer account (e.g. by logging in via `/api/v1/auth/login`).
   - Store the token in an environment variable for curl commands:
     ```bash
     export TOKEN="your_jwt_access_token_here"
     export BASE_URL="http://localhost:3000/api/v1"
     ```

---

## Validation Scenarios

### Scenario 1: Create First Address (Auto-Default Verification)
**Target**: User Story 1 (AC 1 & AC 2)  
**Description**: Create the user's first address without passing `isDefault: true`. The backend must automatically save it with `isDefault: true`.

```bash
curl -X POST "$BASE_URL/addresses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "home",
    "fullName": "Jane Doe",
    "phone": "+1-555-0101",
    "street": "100 Main Street, Apt 1A",
    "city": "Springfield",
    "province": "Illinois",
    "postalCode": "62701",
    "country": "United States",
    "isDefault": false
  }'
```

**Expected Outcome**:
- Status: `201 Created`
- Response:
  ```json
  {
    "success": true,
    "statusCode": 201,
    "message": "Address created successfully",
    "data": {
      "id": 1,
      "label": "home",
      "fullName": "Jane Doe",
      "phone": "+1-555-0101",
      "street": "100 Main Street, Apt 1A",
      "city": "Springfield",
      "province": "Illinois",
      "postalCode": "62701",
      "country": "United States",
      "isDefault": true
    }
  }
  ```

---

### Scenario 2: Create Second Address (Non-Default)
**Target**: User Story 1 (AC 1)  
**Description**: Add a secondary address marked as `office` with `isDefault: false`.

```bash
curl -X POST "$BASE_URL/addresses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "office",
    "fullName": "Jane Doe Work",
    "phone": "+1-555-0102",
    "street": "200 Business Way, Suite 400",
    "city": "Springfield",
    "province": "Illinois",
    "postalCode": "62702",
    "country": "United States",
    "isDefault": false
  }'
```

**Expected Outcome**:
- Status: `201 Created`
- `data.isDefault` is `false`. Address 1 remains `isDefault: true`.

---

### Scenario 3: Create Third Address as Default (Demote Previous Default)
**Target**: User Story 1 (AC 3)  
**Description**: Add a third address with `isDefault: true`. The previous default (Address 1) must be demoted to `false`.

```bash
curl -X POST "$BASE_URL/addresses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "other",
    "fullName": "Jane Doe Vacation",
    "phone": "+1-555-0103",
    "street": "50 Seaside Blvd",
    "city": "Miami",
    "province": "Florida",
    "postalCode": "33101",
    "country": "United States",
    "isDefault": true
  }'
```

**Expected Outcome**:
- Status: `201 Created`
- Response `data.isDefault` is `true`.
- Subsequent `GET /addresses` confirms only this new address has `isDefault: true`.

---

### Scenario 4: Unauthenticated Request Denied
**Target**: User Story 1 (AC 4)  
**Description**: Attempt to create or fetch addresses without a Bearer token.

```bash
curl -i -X GET "$BASE_URL/addresses"
```

**Expected Outcome**:
- Status: `401 Unauthorized`

---

### Scenario 5: List All Saved Addresses
**Target**: User Story 2 (AC 1)  
**Description**: Retrieve the address book for the authenticated user.

```bash
curl -X GET "$BASE_URL/addresses" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Outcome**:
- Status: `200 OK`
- `data` contains an array of the 3 created addresses, with exactly one having `isDefault: true`.

---

### Scenario 6: Fetch Address by ID
**Target**: User Story 2 (AC 2)  
**Description**: Retrieve a single address by its ID.

```bash
curl -X GET "$BASE_URL/addresses/1" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Outcome**:
- Status: `200 OK`
- Response contains full address details for address ID 1.

---

### Scenario 7: Privacy Isolation / Cross-User Access Attempt
**Target**: User Story 2 (AC 3) & FR-007  
**Description**: Attempt to fetch, update, or delete an address ID that belongs to another user (or nonexistent ID 99999).

```bash
curl -i -X GET "$BASE_URL/addresses/99999" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Outcome**:
- Status: `404 Not Found` (Never `403`, to avoid leaking existence).
- Message: `Address not found`

---

### Scenario 8: Update Address & Demote Previous Default
**Target**: User Story 3 (AC 1 & AC 2)  
**Description**: Update Address 1 (which was previously demoted) to become the default and correct its phone number.

```bash
curl -X PATCH "$BASE_URL/addresses/1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1-555-9999",
    "isDefault": true
  }'
```

**Expected Outcome**:
- Status: `200 OK`
- Address 1 has `phone: "+1-555-9999"` and `isDefault: true`.
- Address 3 is automatically demoted to `isDefault: false`.

---

### Scenario 9: Demotion Rejection (Invalid Default Invariant)
**Target**: Edge Cases (line 84)  
**Description**: Try setting `isDefault: false` on Address 1 while multiple addresses exist.

```bash
curl -i -X PATCH "$BASE_URL/addresses/1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isDefault": false
  }'
```

**Expected Outcome**:
- Status: `400 Bad Request`
- Message: `"Cannot unset default status on the default address while multiple addresses exist. Designate another address as default instead."`

---

### Scenario 10: Delete Default Address & Verify Auto-Promotion
**Target**: User Story 4 (AC 2)  
**Description**: Delete Address 1 (the current default). The system must promote the latest remaining address to default.

```bash
curl -X DELETE "$BASE_URL/addresses/1" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Outcome**:
- Status: `200 OK`
- Response: `{"success": true, "statusCode": 200, "message": "Address deleted successfully", "data": {"id": 1}}`
- When calling `GET $BASE_URL/addresses`, one of the remaining addresses (the one with the latest `createdAt`) now has `isDefault: true`.

---

### Scenario 11: Delete Remaining Addresses Down to Zero
**Target**: User Story 4 (AC 3)  
**Description**: Delete remaining addresses until no addresses remain.

```bash
# Delete remaining addresses by ID
curl -X DELETE "$BASE_URL/addresses/2" -H "Authorization: Bearer $TOKEN"
curl -X DELETE "$BASE_URL/addresses/3" -H "Authorization: Bearer $TOKEN"

# Verify list is empty
curl -X GET "$BASE_URL/addresses" -H "Authorization: Bearer $TOKEN"
```

**Expected Outcome**:
- Status: `200 OK`
- `data`: `[]` (empty list with 0 defaults).
