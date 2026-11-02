# HTTP API standard

**Version:** 1.0 (2026-11-02). **For:** every HTTP API of ours, public or used only by our own
frontend. **Audience:** the developer, or the AI agent, designing, building or reviewing an API.

Every API of ours answers the same way: the same URL shapes, the same status codes, the same body
envelope, the same list parameters, the same error body. A frontend, a partner or an agent that knows
one of our APIs knows them all. This standard defines that contract; the error body and the
validation format are in the [architecture standard](architecture.md), section 6, and are part of it.

The rules are stack-agnostic. Concrete code is in the **Reference implementation (Node/React)**
callouts.

**If you are an agent implementing this in a project:**

1. Read the whole standard first, then the project's routers, its list-query helper and its API
   documentation. Build new endpoints like the existing ones when they follow this standard.
2. A change to an existing endpoint is additive (section 9). Anything else is a new version or a
   decision.
3. Every endpoint you add or change is documented in the same change, and the documentation check
   passes (section 11).
4. Finish with the checklist in section 12.

The key words **must**, **must not** and **should** mean what they say. Rules have IDs
`API-<area><n>`: `N` naming, `M` methods and statuses, `B` bodies, `L` lists, `S` field shaping,
`I` idempotency, `C` concurrency, `R` rate limits, `V` versioning, `T` types, `D` documentation.

## 1. Resources and URLs

- **API-N1 — Nouns, plural, kebab-case:** `/orders`, `/orders/{orderId}`, `/billing-prices`. The verb
  is the HTTP method.
- **API-N2 — Nesting shows ownership, one level deep:** `/orders/{orderId}/lines`. Deeper relations
  get their own top-level resource with a filter (`/lines?orderId=...`).
- **API-N3 — Actions that are not CRUD are sub-resources named by the verb**, always `POST`:
  `POST /invoices/{id}/cancel`, `POST /orders/{id}/schedule`. Not `PATCH { status: "cancelled" }` when
  the transition has rules, side effects or its own permission.
- **API-N4 — `me` for the caller:** `/users/me`, `/users/me/sessions`.
- **API-N5 — JSON field names in camelCase**, enum values in `snake_case`, the same words as the
  product (ARCH-N2).
- Admin or cross-tenant variants live under their own prefix (`/admin/orders`) with their own
  permissions, rather than a flag on the public route.

## 2. Methods and status codes

| Method   | Use                                      | Success                                                                                                                    |
| -------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | read; never changes state                | `200`                                                                                                                      |
| `POST`   | create, or run an action (API-N3)        | `201` with the created resource (and `Location`), `200` for an action that returns a result, `202` when the work is queued |
| `PATCH`  | partial update: only the fields sent     | `200` with the updated resource                                                                                            |
| `PUT`    | full replacement (rare: settings, a set) | `200`                                                                                                                      |
| `DELETE` | delete or archive                        | `204` with no body                                                                                                         |

- **API-M1 — Errors use the statuses of architecture 6.2:** `400` malformed, `401` not signed in,
  `403` not allowed, `404` not found **or not visible**, `409` conflict with the current state, `422`
  validation, `429` rate limit, `503` dependency down; `500` only for the unexpected. Each with the
  error body and a stable `code`.
- **API-M2 — `GET`, `PUT` and `DELETE` are idempotent**; a repeated `DELETE` of something already gone
  is `204` or `404`, decided once for the API and documented.
- **API-M3 — No state change on `GET`**, not even "mark as read": that is a `POST`.

## 3. Bodies

- **API-B1 — Success bodies are wrapped in `data`:** `{ "data": { ...resource } }` for one,
  `{ "data": [ ... ], "meta": { ... } }` for a list. Errors are wrapped in `error`
  (architecture 6.2). A body is never a bare array.
- **API-B2 — A resource has the same shape everywhere** it appears (a list item may be a documented
  subset). Related records are referenced by id, or embedded as a small, documented summary
  (`customer: { id, displayName }`).
- **API-B3 — What the caller may do is in the response:** a resource carries the actions the caller
  is allowed (`allowedActions: ["cancel", "edit"]`) so the frontend never guesses (ARCH-3).
- **API-B4 — Requests accept only documented fields** (ARCH-V3) and `application/json`; anything else
  is `400` or `415`.
- **API-B5 — `null` means "no value"; absent in a `PATCH` means "unchanged".** Booleans are never
  strings.

## 4. Lists

Every list endpoint takes the same parameters and answers with the same `meta`.

- **API-L1 — Never unbounded.** Every list is paginated, with a default size and a maximum (e.g.
  default 10, maximum 100); a larger `limit` is a `422`. An export is its own endpoint, capped and
  audited.
- **API-L2 — Page pagination by default:** `page` (from 1) and `limit`. The answer's `meta` holds
  `page`, `limit`, `total` and `totalPages`. **Cursor pagination** (`cursor`, `limit`, answer
  `meta.nextCursor`, no total) for feeds, very large or fast-changing collections.
- **API-L3 — Filters are query parameters named after the field:** `?status=open`. A multi-value
  filter repeats the parameter (`?status=open&status=paid`) and means "any of". Ranges use suffixes
  (`createdFrom`, `createdTo`). Every filter is validated; an unknown filter is a `422`.
- **API-L4 — Sorting:** `sort=field` ascending, `sort=-field` descending, from an **allow-list** per
  endpoint (fields with an index); anything else is a `400`/`422` with its code. A default sort is
  always applied, with a unique tie-breaker (the id) so pages are stable.
- **API-L5 — Search:** one `search` parameter, trimmed, length-capped (e.g. 120), matching the fields
  the endpoint documents. An endpoint without search refuses `search` instead of ignoring it.
- **API-L6 — `meta` echoes what was applied** (`sort`, `search`, `filters`) and may describe what the
  caller can use (`sortableFields`, `filterOptions`), so a generic list page needs no hard-coded
  knowledge.

```json
{
  "data": [{ "id": "6c1e...", "number": "INV-2026-00042", "status": "open", "totalCents": 36320 }],
  "meta": {
    "page": 2,
    "limit": 10,
    "total": 61,
    "totalPages": 3,
    "sort": { "field": "issuedAt", "direction": "desc" },
    "search": null,
    "filters": { "status": ["open", "overdue"] },
    "sortableFields": ["issuedAt", "number", "totalCents"]
  }
}
```

> **Reference implementation (Node/React).** One `parseListQuery(req.query, { allowedSortFields,
defaultSort, filterSchema, maxLimit, searchable })` helper validates `page`, `limit`, `sort`,
> `search` and the filters with Zod; `arrayFilter(schema)` normalises a single or repeated parameter
> to an array; `paginatedResponse({ data, total, query })` builds `{ data, meta }`. The frontend keeps
> these parameters in the URL through one shared hook (ARCH-F9).

## 5. Field shaping by permission

- **API-S1 — The server decides which fields a caller sees.** A response is built per caller from
  their permissions and their relation to the record (a manager sees contact details, another
  organisation doesn't). Fields the caller may not see are **absent**, not `null` or masked, and the
  documentation says which permission brings each optional field.
- **API-S2 — One serializer per resource and audience**, used by every endpoint that returns it
  (ARCH-4); never a database document sent as is.
- **API-S3 — Sensitive fields are returned only on the detail endpoint**, whose read is logged
  (privacy standard, PRIV-21, PRIV-22).

## 6. Idempotency for unsafe retries

- **API-I1 — A `POST` that creates something or moves money accepts an `Idempotency-Key` header**
  (a client-generated UUID) when a client may retry it after a timeout (payments, orders, public
  submissions, partner calls). The server stores the key with the caller and the response for a
  period (e.g. 24 h): the same key returns the stored response; the same key with a different body is
  a `422`; a key still in progress is a `409`.
- **API-I2 — Natural idempotency first:** an action on a state machine is idempotent by its
  transition (cancelling a cancelled invoice is a `409` with its code, never a second side effect).
- Webhooks we receive are deduplicated by the sender's event id.

## 7. Concurrency

- **API-C1 — A record two people can edit carries a version** (an integer, or an `ETag` header). An
  update sends the version it read (in the body, or `If-Match`); a stale one is a `409` with a stable
  code (e.g. `version_conflict`) and the current version, never a silent overwrite (ARCH-B12).
- **API-C2 — Counters, balances and quotas change through atomic, guarded updates**, and a race lost
  is a `409` with its code.

## 8. Rate limits

- **API-R1 — Rate-limited responses say so:** the standard headers (`RateLimit-Limit`,
  `RateLimit-Remaining`, `RateLimit-Reset`, or the combined `RateLimit` / `RateLimit-Policy` of the
  current IETF draft), and on a `429` a `Retry-After` header plus `retryAfterSeconds` in the error
  body. For a browser client on another origin, CORS exposes these headers. Which routes are limited
  is in the security standard (SEC-R1).

## 9. Versioning and change

- **API-V1 — The major version is in the path:** `/api/v1/...`. A new major version only for a
  breaking change that cannot be done additively.
- **API-V2 — Within a version, changes are additive only:** new endpoints, new optional request
  fields, new response fields, new enum values **only where the documentation says clients must
  accept unknown values**. Never a removed or renamed field, a changed type or meaning, a new required
  field, or a stricter validation of an existing field.
- **API-V3 — Deprecation policy:** a deprecated endpoint or field is marked in the documentation and
  answers with a `Deprecation` header (and `Sunset` with the removal date); it keeps working for an
  announced period (e.g. 6 months for partner-facing APIs, until the frontend no longer uses it for an
  internal one). Usage is measured before removal.
- An API used only by our own frontend may change in step with it, in the same release, provided the
  previous frontend still works during the rollout (CI/CD standard, CI-18).

## 10. Types

- **API-T1 — Dates and times are ISO 8601 in UTC** with `Z` (`2026-11-02T14:30:00.000Z`); calendar
  dates without time are `YYYY-MM-DD`. Time zones are applied by the client for display.
- **API-T2 — Money is never a float:** an integer in minor units with its currency
  (`{ "amountCents": 36320, "currency": "CHF" }`), or a decimal string (`"363.20"`) where minor units
  don't fit. Field names carry the unit (ARCH-N4).
- **API-T3 — Ids are opaque strings** (UUIDs), never sequential integers that reveal volumes or invite
  enumeration. Human-readable references (`INV-2026-00042`) are separate fields.
- **API-T4 — Enums are closed lists of `snake_case` strings**, documented; durations carry their unit
  (`timeoutMs`); booleans read as questions (`isActive`).
- **API-T5 — Languages:** the API returns keys and data, not user sentences (architecture 6.2);
  localised content stored per language (product names) is returned per language or by
  `Accept-Language`, documented per endpoint.

## 11. Documentation

- **API-D1 — OpenAPI 3 describes every route**, generated from or kept next to the router code, with
  request and response schemas, the permission needed, every error code the route can return, and an
  example. Internal-only routes are documented too.
- **API-D2 — The documentation is checked on every commit:** every route has a documented operation
  and every documented operation has a route, with unique `operationId`s
  ([commit-checks standard](commit-checks.md), section 4.3).
- **API-D3 — Not documented publicly:** test-only hooks (which production refuses) and bot-trap
  fields (ARCH-V9).
- The documentation UI is served in non-production environments; in production it is off or behind
  authentication.

## 12. Checklist

- [ ] Plural kebab-case resources, one level of nesting, actions as `POST` sub-resources, camelCase fields, `snake_case` enums.
- [ ] Methods and statuses as in section 2; errors in the architecture 6.2 body with stable codes; `404` for what the caller can't see.
- [ ] Success bodies wrapped in `data` (and `meta` for lists); resources carry `allowedActions`.
- [ ] Every list paginated with a maximum; `page`/`limit` with `total`/`totalPages` (or a cursor); multi-value filters; `sort=-field` from an allow-list with a stable tie-breaker; one `search`; unknown parameters refused.
- [ ] Fields shaped by the caller's permissions, absent when not allowed; one serializer per resource.
- [ ] `Idempotency-Key` on retryable creating or paying `POST`s; state transitions idempotent by design.
- [ ] Versions or ETags on concurrently edited records; `409` on a stale write.
- [ ] Rate-limit headers, `Retry-After` and `retryAfterSeconds` on `429`.
- [ ] `/api/v1`; additive changes only; deprecation headers and an announced period before removal.
- [ ] ISO 8601 UTC dates; money in minor units or decimal strings with a currency; opaque UUID ids.
- [ ] OpenAPI for every route, checked both ways on every commit; test hooks and trap fields not published.
