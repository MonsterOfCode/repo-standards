# Architecture standard

**Version:** 1.0 (2026-10-31). **For:** every project of ours, backend and frontend. **Audience:**
the developer, or the AI agent, building or reviewing code in a project.

Every project is organized the same way, so anyone (person or agent) opening any of our repos knows
where a file lives before searching for it, which layer may call which, and where a rule belongs.
This standard defines the folders, the layers and their dependencies, the naming, and the code
rules that keep a project legible as it grows. The layer rules are checked on every commit.

**If you are an agent working in a project:**

1. Read the whole standard before writing code. Then read the project's `AGENTS.md`, its decision
   log and the files next to the one you change: the project's existing pattern wins over your
   habit, as long as it follows this standard.
2. Before creating a file, find its layer (sections 3 and 4) and its name (section 5). Before
   creating a function, search for an existing one that does the same thing (ARCH-4).
3. When no rule fits, choose the cleanest solution and record it in the decision log (section 10).
4. When reviewing, cite the rule you apply by its ID ("violates ARCH-B2").

The key words **must**, **must not** and **should** mean what they say. Rules have IDs: `ARCH-n`
(principles), `ARCH-Bn` (backend), `ARCH-Fn` (frontend), `ARCH-Vn` (validation and errors),
`ARCH-Nn` (naming), `ARCH-Cn` (code).

## 1. Principles

- **ARCH-1 — Layer first, never feature folders.** Top-level folders are layers (the technical role
  of a file). There is no `features/<x>/` folder holding its own api, components, hooks and pages.
  See section 2.
- **ARCH-2 — Dependencies point one way.** A layer imports only the layers below it (sections 3 and
  4). No import cycles.
- **ARCH-3 — The backend is the authority.** Permissions, visibility, validation and business math
  live in the backend. The frontend only reflects what the API returns: it never decides access from
  a role name and never recomputes a price.
- **ARCH-4 — One rule, one function.** A business rule exists in exactly one place, and every path
  that needs it calls that place (e.g. one `disableUserAccount` for every way an account is
  disabled). Copying a rule is a bug waiting for its second fix.
- **ARCH-5 — Consistency over local optimum.** A pattern (table, filter, dialog, form error, error
  code, service function) is the same everywhere. Changing it on one page means changing it on every
  sibling page in the same change.
- **ARCH-6 — No speculative abstraction.** A shared wrapper, base class or option is created when the
  second or third real use appears, not before. Three similar lines are better than a framework.
- **ARCH-7 — Explicit over magic.** No global mutable state, no implicit registration by file name,
  no monkey-patching. A reader follows the imports to find what runs.

## 2. Folders: layer first (ARCH-1)

Feature folders (`features/billing/{api,components,hooks,pages,store}`) look tidy on day one and
become confusing fast: shared code gets stuck inside one feature or imported across features,
every feature invents its own internal layout, and nobody remembers in which feature a file was put.
We organize by layer instead:

- **The layer answers "where is it?"** A router is in `routers/`, a service in `services/`, an API
  slice in `store/api/`, a page in `pages/`. There is one place to look.
- **The file name answers "which feature?"** Every file name carries its domain (section 5), so all
  the files of a feature are found by searching its name: `billing-price` finds
  `billing-prices-router.js`, `billing-price-service.js`, `billing-price.js` (model),
  `billingPricesApi.js`, `BillingPricesPage.jsx`.
- **Inside a layer, grouping by domain area is allowed** when the layer has many files:
  `models/billing/`, `pages/invoices/`. The group lives inside the layer, never the other way round.

```text
Bad (feature folders)                    Good (layer first, domain in the name)
src/features/billing/api.js              src/routers/billing-prices-router.js
src/features/billing/service.js          src/services/billing-price-service.js
src/features/billing/model.js            src/models/billing/billing-price.js
src/features/billing/utils.js            src/domain/invoice-totals.js
src/features/invoices/...                src/services/invoice-service.js
```

## 3. Backend layers (Node API)

| Layer          | Holds                                                                                                     | May import                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `routers/`     | HTTP: validate the input, require the permission, call **one** service function, shape the response, document the route | services, policies, middleware, model schemas and constants, errors, config, util |
| `services/`    | use cases: orchestrate, open transactions, write audit events, call models and adapters                   | services, domain, policies, models, adapters, database, emails |
| `domain/`      | pure business rules: calculations, state machines, matching. No I/O                                       | domain, model schemas and constants, util, config, errors      |
| `policies/`    | authorization: who may see or do what, and the query filters that enforce it                             | domain, models, services (to read), util, config, errors       |
| `models/`      | one file per collection: schema, enums, document factory, data access                                    | database, other models, util, config, errors                   |
| `adapters/`    | one client per external service, behind the interface the services use; timeouts, retries, error mapping | util, config, errors                                           |
| `jobs/`        | scheduled jobs: a lock, a call to a service, a run record                                                | services, database (the job lock), util, config               |
| `middleware/`  | cross-cutting HTTP concerns: auth, CSRF, rate limit, access log, errors                                  | services, policies, util, config, errors                       |
| `database/`    | connection, transactions helper, the distributed job lock, migrations and their runner's config           | config, util                                                   |
| `emails/`, `locales/` | message builders and translations                                                                  | util, config                                                   |
| `config/`      | the only reader of environment variables (validated once at start), constants, allow-lists               | nothing from the layers above                                  |
| `errors/`      | typed errors with stable codes                                                                            | nothing                                                        |
| `util/`        | generic helpers with no product knowledge (dates, regex, concurrency, logger)                             | util, config, errors                                           |

Rules, checked on every commit (`npm run check:architecture`, section 9):

- **ARCH-B1** — Only the composition roots (app entry, root router, OpenAPI aggregator, a test-only
  hooks router), listed explicitly in the check's configuration, import routers and jobs. A service
  never imports a job: what both need (a job's lock id, its schedule) lives in `config/`.
- **ARCH-B2** — A router never touches the database or an adapter. It may import a model's **schema
  and constants** for validation, never its data access.
- **ARCH-B3** — `domain/` is pure: no database, service, adapter, router, job or email.
- **ARCH-B4** — Models never import services, policies, routers, jobs or adapters.
- **ARCH-B5** — `util/` has no product knowledge: it imports only util, config and errors. A helper
  that needs a service is a service.
- **ARCH-B6** — `config/` imports nothing from the product layers.
- **ARCH-B7** — No import cycles. Two services that need each other share a third, lower piece
  (a domain function, a smaller service).

Rules checked by review:

- **ARCH-B8 — Validate at the edge.** Every `body`, `query` and `params` is parsed by a schema (Zod)
  in the router before any service call, and a refusal is a 422 in the format of section 6.
- **ARCH-B9 — Thin routers, thin jobs.** A router or a job holds no business rule: if it has an
  `if` about the domain, that `if` belongs in a service or `domain/`.
- **ARCH-B10 — Authorization in policies.** Never an ad-hoc role-name check (`if (user.role ===
  "admin")`) in a router or service: a permission and a policy function. Lists are filtered in the
  query, not after loading.
- **ARCH-B11 — Several writes, one transaction.** A change that writes more than one document (or a
  document and its audit event) runs in one transaction. Errors propagate so the driver can retry.
- **ARCH-B12 — Concurrency is explicit.** A record two people can edit carries a version; a stale
  save is a 409 with a stable code. Counters and balances change through atomic, guarded updates.
- **ARCH-B13 — External calls through adapters.** Every external service has one adapter with a
  timeout, bounded retries with backoff for idempotent calls, and its errors mapped to our typed
  errors. A test replaces the adapter, never the network.
- **ARCH-B14 — No N+1.** No awaited query per item in a loop: one batched query (`$in`, bulk write,
  aggregation), or bounded concurrency for external calls. A legitimately sequential loop says why
  in a comment.
- **ARCH-B15 — Every query has an index.** A test asserts the query plans of the main queries use an
  index (no collection scan). Indexes are created by migrations only, never by the app at start.
- **ARCH-B16 — Typed errors, stable codes.** Errors are classes mapped to an HTTP status, with a
  stable `snake_case` code the frontend translates, in the body of section 6.2. A new situation gets
  a new code; a shipped code never changes meaning.

## 4. Frontend layers (React SPA)

| Layer               | Holds                                                                                      | May import                                       |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `routes/`           | the route tree, lazy loading and route guards                                             | pages, layout, components, hooks, store          |
| `pages/<area>/`     | one `XPage.jsx` per route, its private subcomponents, its pure helpers (`xUi.js`)          | components, hooks, store, util, config, its own area |
| `layout/`           | the app shell: sidebar, header, guards, banners                                           | components, hooks, store, util, config           |
| `components/ui/`, `components/forms/` | design-system primitives and form controls                        | each other, util, config                         |
| `components/<area>/`| product components shared by several pages                                                | components, hooks, store, util, config           |
| `hooks/`            | reusable hooks (`useXxx`)                                                                 | store, util, config                              |
| `store/`            | the state store; `store/api/<domain>Api.js`: every server call, one slice per domain       | util, config                                     |
| `util/`             | plain functions (formatting, error mapping, the fetch wrapper)                            | util, config                                     |
| `config/`, `locales/`, `styles/` | environment, navigation, i18n setup, translations, design tokens             | nothing from the layers above                    |

Rules, checked on every commit:

- **ARCH-F1** — Pages are leaves: only the router imports a page module. The layout and the shared
  components never import from `pages/`.
- **ARCH-F2** — A page area never imports from another area. A helper or component two areas need
  moves to `components/`, `hooks/` or `util/`, under a name that says what it is.
- **ARCH-F3** — Only `store/api` (through the fetch wrapper in `util/`) talks to the server. No
  `fetch`/axios in a page, component or hook.
- **ARCH-F4** — Primitives (`components/ui`, `components/forms`) never fetch data and never import a
  page, the layout or a product component. A filter that needs a lookup receives it as a prop.
- **ARCH-F5** — `store/` never imports UI. **ARCH-F6** — `util/` never imports UI or the store.
- **ARCH-F7** — No import cycles.

Rules checked by review:

- **ARCH-F8 — Server state lives in the query cache.** Data from the API is read from the API
  slice's hooks, never copied into local or global state. After a mutation, the cache is updated or
  invalidated by tags, not refetched by hand.
- **ARCH-F9 — State in the URL when it should survive a refresh.** A list's page, sort, search and
  filters live in the URL, through one shared hook.
- **ARCH-F10 — One pattern per kind of page.** Lists, detail pages, dialogs, forms and tabs follow
  the project's layout standard (a document in the project); a new kind of page starts by writing
  its pattern there.
- **ARCH-F11 — Dialogs own their state.** A dialog's form state and mutations live in a child
  rendered inside the dialog, so closing it unmounts and resets everything.
- **ARCH-F12 — Errors where the user looks.** Field errors (client check and API 422 alike) show
  under their inputs and focus the first one, general errors in the form's general area, and every
  failed submit shows a toast (section 6.4). Outcomes outside a form are toasts.
- **ARCH-F13 — Styling in CSS, not in JS constants.** Shared visual states are named CSS utilities
  with the app's prefix (commit-checks standard, section 5.1). Light and dark themes and phone width
  are part of every UI change.
- **ARCH-F14 — Accessible by default.** WCAG 2.2 AA: every control has a label, every dialog traps
  and returns focus, nothing is reachable only by mouse, contrast passes in both themes.

## 5. Naming

- **ARCH-N1 — The file name carries the domain and the role.** Backend (kebab-case):
  `<domain>-router.js`, `<domain>-service.js`, `<domain>-policy.js`, `<domain>-adapter.js`
  (`billing-bexio-adapter.js`), `<domain>-job.js`, `<entity>.js` for a model. Frontend:
  `<Domain>Page.jsx`, `<domain>Ui.js`, `<domain>Api.js`, `use<Thing>.js`, `<Thing>.jsx`.
- **ARCH-N2 — The product's words.** Names use the product's vocabulary, the same word in the
  database, the API, the code and the UI. No synonyms (`client` here, `customer` there) and no
  generic names (`data`, `info`, `manager`, `helper`, `utils2`).
- **ARCH-N3 — Names say the scope.** A constant or setting says which layer and what it governs
  (`HTTP_LEDGER_BODY_FIELDS_WITH_VALUES`, not `FIELDS`). A boolean reads as a question (`isActive`,
  `hasPaidInvoice`). A function is a verb (`issueInvoice`, `listOpenRequests`).
- **ARCH-N4 — Units in the name or the type.** Money in integer cents (`unitPriceCents`), durations
  with their unit (`timeoutMs`, `retentionDays`), instants stored in UTC and shown in the user's
  time zone.

## 6. Input validation, errors and bot traps

### 6.1 Validate twice, the backend decides

- **ARCH-V1 — Every input is validated in the frontend and in the backend, with the same rules.**
  The frontend validates for the user (immediate feedback under the field, no round trip); the
  backend validates because it is the authority (ARCH-3) and a request can come from anywhere. A
  rule only in the frontend is not a rule.
- **ARCH-V2 — Same rule, same key.** The frontend's check and the backend's refusal for the same
  rule produce the same key (6.3), so the user reads the same message whichever side caught it.
- **ARCH-V3 — The backend refuses what it does not know.** Unknown fields are rejected or stripped,
  never stored. Strings are trimmed; an empty string means "not entered".
- **ARCH-V4 — Rules that need data are checked by the backend only** (unique email, existing
  postal code, a date after another record's date) and come back in the same format as the others.

### 6.2 The error body

Every error, whatever its status, has the same body, wrapped in `error` so an error can never be
mistaken for data:

```json
{
  "error": {
    "code": "invoice_already_paid",
    "message": "The invoice is already paid.",
    "requestId": "4f1c2a..."
  }
}
```

- `code`: the stable `snake_case` code the frontend translates (ARCH-B16).
- `message`: a short English sentence for developers and logs, never shown as is to a user.
- `requestId`: the id of the request in the logs (logging standard), so a user's report finds it.
- Optional, per code: `params` (values the translated message needs, e.g. `{ "count": 2 }`) and
  `retryAfterSeconds` (429, 503).

**The backend never sends a sentence for a user, only keys and their parameters.** Every product
speaks several languages; the frontend owns every text, in every language, and turns a key and its
parameters into the sentence the user reads.

**A validation failure is always `422`**, with code `validation_failed` and an `errors` object:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The given data was invalid.",
    "requestId": "4f1c2a...",
    "errors": {
      "email": [{ "key": "validation.email" }],
      "password": [{ "key": "validation.min.string", "params": { "min": 12 } }],
      "address.postalCode": [{ "key": "validation.required" }],
      "lines.0.quantity": [{ "key": "validation.min.numeric", "params": { "min": 1 } }],
      "_general": [{ "key": "validation.end_before_start" }]
    }
  }
}
```

- **ARCH-V5 — One entry per field, in dot notation**: the path of the field in the request body,
  array items by index (`lines.0.quantity`). The frontend maps the path to its input.
- **ARCH-V6 — A list per field**, because a field can break several rules; the frontend shows the
  first.
- **ARCH-V7 — Each item is a translation key with its parameters**, never a sentence. A rule about
  the request as a whole (not one field) goes under `_general`.
- Other statuses: `400` malformed request (bad JSON, wrong content type), `401` not signed in, `403`
  not allowed, `404` not found or not visible, `409` conflict with the current state (stale
  version, already done, a business rule refusing the action), `429` rate limit, `503` a dependency
  is down. Never `422` for those, and never `400` for a validation failure.

### 6.3 Rule keys

The rule keys are the validation rules' names, `validation.<rule>`, in `snake_case`. A rule whose
meaning depends on the type of the value has the type as a suffix: `.string` (characters),
`.numeric` (value), `.array` (items), `.file` (kilobytes).

| Rule key                                | Parameters             | When                                                    |
| --------------------------------------- | ---------------------- | ------------------------------------------------------- |
| `validation.required`                   |                        | absent, null, empty string or empty list                |
| `validation.required_if`, `validation.required_with` | `other`, `value` | required because of another field             |
| `validation.string`, `validation.integer`, `validation.numeric`, `validation.boolean`, `validation.array`, `validation.date` | | wrong type |
| `validation.email`, `validation.url`, `validation.uuid` |        | wrong format                                            |
| `validation.regex`                      |                        | does not match the expected pattern                     |
| `validation.in`                         | `values` (optional)    | not one of the allowed values                           |
| `validation.min.string` / `.numeric` / `.array` / `.file` | `min` | too short, too small, too few, too light               |
| `validation.max.string` / `.numeric` / `.array` / `.file` | `max` | too long, too big, too many, too heavy                 |
| `validation.gt.*` / `validation.lt.*`  | `value`                | an exclusive bound: greater than / less than (`positive()`) |
| `validation.between.*`, `validation.size.*` | `min`, `max` / `size` | out of a range, not the exact size                    |
| `validation.decimal`                    | `decimal`              | too many decimals                                       |
| `validation.after`, `validation.before`, `validation.after_or_equal`, `validation.before_or_equal` | `date` | date order |
| `validation.confirmed`                  |                        | the confirmation field differs                          |
| `validation.accepted`                   |                        | a checkbox that must be ticked (terms)                  |
| `validation.unique`                     |                        | already taken (email, slug)                             |
| `validation.exists`                     |                        | refers to something that does not exist or is not visible |
| `validation.prohibited`                 |                        | must not be sent in this situation                      |

- **The backend keeps a catalogue** of every key it can send (one file), and a test fails when the
  code sends a key that is not in it; the frontend's translation check requires a translation of
  every catalogued key in every language (ARCH-V15).
- **ARCH-V8 — A domain rule gets its own key** in the same namespace and style
  (`validation.unknown_postal_code`, `validation.end_before_start`), listed in the project's
  translations. Every key the backend can send exists in every frontend language (a check).
- The messages live in the frontend's translations, one per key, with the parameters as variables
  (`"min": { "string": "At least {{min}} characters." }`). They never name the field: they are shown
  under it.

### 6.4 How a form shows errors

Every form behaves the same way, whether the client check or the API found the problem:

- **ARCH-V11 — Field errors under their input.** The message shows directly under the field, the
  field is marked invalid (`aria-invalid="true"`, linked to the message with `aria-describedby`), and
  the first invalid field is scrolled into view and focused. Editing a field clears its error.
- **ARCH-V12 — General errors in the form's general area.** An error that belongs to no visible
  field (`_general`, a path the form does not show, a `409`/`400` refusal with its code, a network
  or server failure) shows in one area of the form, above its actions, with `role="alert"`. One
  shared component renders it in every form.
- **ARCH-V13 — Always a notification.** Every failed submit also shows a toast saying the form has
  errors and where to look ("Check the highlighted fields", or the general message), so a person
  who scrolled away still knows the save did not happen.
- **ARCH-V14 — Client checks use the backend's keys.** A required field, an email, a length, a
  range: the client produces `validation.required`, `validation.email`, `validation.max.string` with
  the same parameters the backend would, so both read the same in every language.
- **ARCH-V15 — No key is ever shown raw.** A key the frontend does not know falls back to a generic
  "Check this field" (or "Something went wrong" for a general error), and the check that compares
  the backend's keys with the frontend's translations prevents it.

### 6.5 Bot traps on public forms

- **ARCH-V9 — Every form reachable without an account has a honeypot**: sign-up, contact, public
  request, password reset, data-deletion request, newsletter.
  - A text input named like a real field (`website`), hidden from people (visually hidden, not
    `display: none`; `tabindex="-1"`, `autocomplete="off"`, `aria-hidden="true"`), sent with the
    form. A person leaves it empty; a bot fills it.
  - The backend checks it **after** the normal validation (a bot that sends invalid data gets the
    same 422 as a person). When it is filled, the backend answers exactly like a success (same
    status, same body shape, fresh random ids) and does nothing: no write, no email, no external
    call. The bot gets no signal it was detected.
  - The detection is logged as a warning (route, hashed IP, app client), never with the submitted
    content.
  - The honeypot field is **not** in the public API documentation (OpenAPI): publishing its name
    tells bot authors what to avoid.
- **ARCH-V10 — Every public form also has its own rate limit**, tighter than the general one (e.g. a
  few per minute and per hour per IP), answered `429` with its own code.
- Optional, per form: a minimum fill time (a form submitted under ~2 seconds after it was rendered
  is treated like a filled honeypot). A CAPTCHA only when the honeypot and the rate limit are proven
  not enough.

## 7. Code rules

- **ARCH-C1 — Configuration.** Only `config/` reads environment variables, validated by a schema at
  start (the app refuses to start on a bad value). Feature flags and thresholds are config, with a
  safe default, listed in `.env.example`.
- **ARCH-C2 — Size and complexity.** Cognitive complexity at most 15 per function (lint). A function
  over ~50 lines or a file over ~400 lines is a signal to extract a well-named piece; never split
  by line count alone.
- **ARCH-C3 — Comments say why.** The code says what. A comment explains a non-obvious reason and
  cites the decision (`// D182: the owner account cannot be disabled`). No commented-out code, no
  TODO without an issue number.
- **ARCH-C4 — Dead code is deleted.** Unused exports, files, translation keys, CSS classes and
  feature flags that are always on are removed in the same change that makes them unused.
- **ARCH-C5 — Logging and audit.** Through the shared logger only (logging standard), audit events
  through the audit service (audit-log standard). Never `console.log`.
- **ARCH-C6 — Imports through the alias.** `#/services/x.js` or `@/app/...`, never `../../../`.
- **ARCH-C7 — Idempotent jobs and migrations.** A job or migration run twice gives the same result.
  A job takes a distributed lock and records its run (service-health standard).
- **ARCH-C8 — Personal data is minimized.** Store only what the product needs, log none of it, and
  give every collection holding personal data its retention and erasure path.

## 8. Anti-patterns

**Business rule in a router (ARCH-B9, ARCH-4).**

```js
// Bad: the rule lives in the router, and the job that renews invoices will copy it.
router.post("/invoices", async (req, res, next) => {
  const total = req.body.lines.reduce((sum, l) => sum + l.price * l.qty, 0) * 1.081;
  ...
});

// Good: the router validates and delegates; the math is one pure, tested function.
router.post("/invoices", requirePermission("invoices.manage"), async (req, res, next) => {
  try {
    const input = IssueInvoiceSchema.parse(req.body);
    res.status(201).json({ data: await issueInvoice(req.context, input) });
  } catch (err) {
    return next(err);
  }
});
// domain/invoice-totals.js: invoiceTotals(lines, vatRate) - used by the service and the job.
```

**Role check instead of a permission (ARCH-B10).**

```js
if (req.user.role === "admin") { ... }                   // Bad: in a handler or a service

router.delete("/billing-prices/:id",                     // Good: a grantable, tested permission
  requirePermission("billing_prices.manage"), deleteBillingPriceHandler);
```

**Query per item (ARCH-B14).**

```js
for (const id of ids) users.push(await findUser(id));    // Bad: N round trips
const users = await findUsers({ _id: { $in: ids } });    // Good: one query
```

**Two writes without a transaction (ARCH-B11).**

```js
await markInvoicePaid(id);                               // Bad: a crash in between loses the audit
await recordAuditEvent("invoice.paid", ...);

await withTransaction(async (session) => {               // Good: both commit or neither
  await markInvoicePaid(id, { session });
  await recordAuditEvent("invoice.paid", ..., { session });
});
```

**Server data copied into state (ARCH-F8).**

```jsx
const { data } = useGetInvoicesQuery(params);            // Bad: a second copy that goes stale
const [invoices, setInvoices] = useState([]);
useEffect(() => setInvoices(data ?? []), [data]);

const { data: invoices = [] } = useGetInvoicesQuery(params); // Good: one source of truth
```

**Access decided in the frontend (ARCH-3).**

```jsx
{user.role === "admin" && <DeleteButton />}               // Bad: the frontend guesses
{record.allowedActions.includes("delete") && <DeleteButton />} // Good: the API says
```

**Helper imported across page areas (ARCH-F2).**

```js
import { statusBadge } from "@/app/pages/requests/requestUi"; // Bad: in pages/patients/
import { requestStatusBadge } from "@/app/util/requestStatus"; // Good: shared, named for what it is
```

## 9. Enforcement

- **`npm run check:architecture`** runs [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
  with the layer rules (ARCH-B1–B7, ARCH-F1–F7). It is part of `npm run checks`, so it runs in the
  pre-commit hook and in CI (commit-checks standard).
  - Reference configuration: `config/dependency-cruiser/node-backend.cjs` and
    `react-frontend.cjs` (+ `react-frontend.aliases.cjs` for the bundler's `@/` alias), copied to
    the project root as `.dependency-cruiser.cjs`. Adapt the folder names at the top; keep the rules.
  - `npm i -D dependency-cruiser`, then `"check:architecture": "depcruise src --config .dependency-cruiser.cjs"`.
  - An existing project that adopts the check fixes its violations; it does not add them to an
    ignore list. While a large fix is in progress, a violation may be listed in the config's
    `allowed` exceptions with the issue number, and the list only shrinks.
- **Lint** carries the rest that a tool can check: cognitive complexity 15, `no-await-in-loop`, no
  `console`, no `process.env` outside `config/` (`n/no-process-env` with an override for `config/`),
  zero warnings.
- **Review** carries the rules no tool checks. A reviewer (person or agent) cites the rule ID.

## 10. When no rule fits

- Choose the cleanest solution that keeps the principles of section 1, and record it in the
  project's decision log (agents standard, section 4): context, decision, why, consequences.
- A project that cannot follow a rule of this standard records the exception and the reason in its
  decision log, and the code that deviates cites the decision.
- A rule that turns out to be wrong for every project is changed here, by a pull request.

## 11. Checklist

- [ ] Top-level folders are layers; no `features/` folder; every file name carries its domain.
- [ ] `npm run check:architecture` runs in `checks` (pre-commit and CI) with no violation.
- [ ] Routers validate every input with a schema, require a permission, call one service; no database access.
- [ ] Business rules live in `domain/` or services, once; authorization in permissions and policies.
- [ ] Multi-document writes in a transaction; concurrent edits guarded by versions.
- [ ] External services behind adapters with timeouts, bounded retries and typed errors.
- [ ] No N+1 queries; the main queries are proven to use an index.
- [ ] Every input validated in the frontend and the backend with the same rules and keys; a refusal is a 422 with `errors` per field in dot notation (section 6).
- [ ] Every form: field errors under the input and focused, general errors in one shared general area, a toast on every failed submit (6.4).
- [ ] One error body (`message`, `code`, `requestId`) for every status; statuses used as in 6.2.
- [ ] Every form reachable without an account has the honeypot (decoy success, not in OpenAPI) and its own rate limit.
- [ ] Frontend: server calls only in `store/api`; no page-to-page or cross-area imports; primitives fetch nothing.
- [ ] Frontend: server data only in the query cache; list state in the URL; one pattern per kind of page.
- [ ] Only `config/` reads the environment; lint enforces complexity 15 and zero warnings.
- [ ] Every deviation is a decision in the log, cited where the code deviates.
