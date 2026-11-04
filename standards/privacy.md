# Privacy and data protection standard

**Version:** 1.1 (2026-11-03). **For:** every project of ours that stores data about people.
**Audience:** the developer, or the AI agent, designing or reviewing how a project collects, keeps,
shows and deletes personal data.

**Changes in 1.1:** erasure and backups (PRIV-39 to PRIV-41): an erasure ledger kept outside the
backups and re-applied after every restore, crypto-shredding with a separately backed-up key vault,
bounded backup retention, and a restore drill that proves an erased person stays erased. PRIV-10
now points to them.

Most of our applications store data about people, and some store especially sensitive data (health,
finances, identity documents). This standard turns data-protection law into engineering rules that
are the same in every project: know what you hold and why, keep as little as possible for as short
as possible, let people see, correct and erase their data, never leak it into logs or third-party
tools, and know what to do when something goes wrong. It is written to satisfy the EU GDPR and the
Swiss nLPD, named here only as examples: the project records which laws apply to it.

This standard is not legal advice. Legal bases, retention periods and notification duties are
confirmed by a person responsible for data protection, and recorded in the project's decision log.

**If you are an agent implementing this in a project:**

1. Read the whole standard first. Then list every collection or table and every field that holds
   personal data, every place data leaves the service (emails, partners, analytics, error tracking,
   logs, exports), and every job that deletes data.
2. Build the data register (section 2) first; every other rule refers to it.
3. Never decide a legal basis or a retention period yourself: propose one and ask the person
   responsible. Record the answer as a decision.
4. Finish with the checklist in section 14, and report every gap.

The key words **must**, **must not** and **should** mean what they say. Rules have IDs `PRIV-n`.

## 1. Principles

1. **Minimal.** Collect only what a purpose needs; a field "that might be useful" is not collected.
2. **Known.** Every piece of personal data is listed with its purpose, legal basis, retention and
   where it goes.
3. **Short-lived.** Data is deleted or anonymised automatically when its purpose ends.
4. **Controlled by the person.** People can see, export, correct and erase their data, and withdraw
   consent, without writing to support.
5. **Contained.** Personal data stays in the product's own stores; logs, URLs, analytics, error
   tracking and the audit log never carry it.
6. **Private by default.** Anything that exposes a person (a public listing, sharing, marketing) is
   off until they turn it on.

## 2. Data classification and the data register

- **PRIV-1 — Every field is classified:**

  | Class     | Examples                                                                                                                                              | Handling                                                                                                         |
  | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
  | public    | a business's published name and address, prices                                                                                                       | no restriction                                                                                                   |
  | internal  | ids, statuses, settings, counts                                                                                                                       | access by permission                                                                                             |
  | personal  | names, email, phone, address, account data, IP addresses                                                                                              | minimised, retention, rights of section 5, never in logs                                                         |
  | sensitive | health data, biometric or genetic data, religion, union membership, criminal records, social-security and identity numbers, financial account numbers | all of the above, plus access logging (section 7), encryption at field level where possible, a DPIA (section 13) |

- **PRIV-2 — A data register** (`docs/privacy/data-register.md`, or generated from the schemas)
  lists, per collection or table: the fields with their class, the **purpose**, the **legal basis**
  (contract, legal obligation, consent, legitimate interest...), the **retention** and how it is
  enforced, who can read it (permissions), and where it is sent (sub-processors, section 11).
- **PRIV-3 — The register changes with the code.** A pull request that adds a personal field adds its
  register line; a review refuses a personal field without one. The schema should carry the class
  (a comment or a metadata flag) so a check can compare it with the register.

## 3. Minimisation and purpose

- **PRIV-4 — Collect for a stated purpose only.** A form asks only for what its purpose needs, and
  says why it asks for anything that isn't obvious. Optional fields are marked optional.
- **PRIV-5 — No reuse for a new purpose** (marketing, analytics, training a model) without a new legal
  basis, recorded in the register.
- **PRIV-6 — Prefer less precise data:** a year of birth over a date when that is enough, a postal
  code over an address, a hashed IP over the IP.
- **PRIV-7 — Pseudonymise across boundaries.** Data sent to analytics, tests or partners uses ids or
  keyed hashes, not identities, unless the purpose needs the identity.

## 4. Retention and deletion

- **PRIV-8 — A retention per data type**, in the register and in config, never "forever". Typical
  examples: an abandoned sign-up a few days; an inactive account a set number of years after its last
  activity, with a warning email first; invoices the period accounting law requires; audit rows per
  the audit-log standard; logs 14–30 days.
- **PRIV-9 — Deletion is automatic:** a database TTL or a scheduled job (under a lock, idempotent,
  recording its run) enforces every retention. A retention written only in a document is not
  enforced.
- **PRIV-10 — Backups follow:** expired data disappears from backups when they rotate (e.g. within
  weeks); a restore re-applies erasures done after the backup's date (PRIV-39 to PRIV-41).
- **PRIV-39 — A restore never brings erased data back.** Backups are not rewritten when someone is
  erased. Instead, an **erasure ledger** is kept **outside the backups** (its own store, with its own
  backup): the ids of the erased people and records (and, with crypto-shredding, the ids of the
  destroyed keys), with the erasure date, and no personal data beyond those opaque ids. After every
  restore, the ledger is re-applied automatically (the same erasure function as PRIV-16) **before the
  restored system serves any traffic** or runs any job that sends data out; the restore fails if the
  re-apply fails. The restore drill (security standard, SEC-B3) checks that a person erased after the
  backup's date is still erased once the restore is done.
- **PRIV-40 — Crypto-shredding, when used.** When personal data is encrypted with a key per person
  (or per record), erasure destroys that key and records its id in the ledger. The key vault is backed
  up **separately** from the data, with its own retention, and a restore of the vault re-applies the
  destroyed key ids from the ledger, so a restored key never decrypts erased data again.
- **PRIV-41 — Backup retention is bounded.** The longest backup retention (SEC-B2) is stated in the
  register and the privacy notice: erased data has left every backup within that period (e.g. "within
  90 days of the erasure"). No backup is kept beyond it, except under a recorded legal hold.

## 5. The rights of the person

- **PRIV-11 — Access and export.** A person can download their data in a structured, common format
  (JSON or CSV, with a readable summary), from their account or through an identity-checked request.
  The export includes what others recorded about them that they may see.
- **PRIV-12 — Who accessed my data.** For sensitive records, the person (or the service on their
  behalf) can obtain the access history from the audit log (audit-log standard, section 11).
- **PRIV-13 — Rectification.** Every personal field the person gave is editable by them; fields
  others hold about them are editable by those people, and a correction is audited.
- **PRIV-14 — Erasure.** A person can ask for their data to be erased, from their account or through
  a public request confirmed by email:
  - the request is confirmed, then carried out within a set delay (e.g. a few days, giving time to
    cancel), by a job;
  - **erasure deletes** what has no reason to stay;
  - **anonymisation** where a record must stay for another legal reason or for others (an invoice, a
    shared case history): the personal fields are cleared or replaced, the record's link to the person
    is cut, and nothing left can identify them;
  - what must be kept by law is listed in the register with its reason, and is kept only for that
    period;
  - a blocked erasure (an unpaid invoice, a legal hold) is recorded, the person is told why, and it
    resumes when the block ends;
  - the audit log is not rewritten: it holds ids only, and labels resolve to "Deleted user" (audit-log
    standard, section 10).
- **PRIV-15 — Objection and restriction** are handled as a request to support with a documented
  procedure, when the legal basis allows them.
- **PRIV-16 — One function per right.** Every path that erases or anonymises a person (self-service,
  admin, expiry job) calls the same function (ARCH-4), and a test proves no personal field survives.

## 6. Consent

- **PRIV-17 — Consent is recorded**, when consent is the legal basis: who, what (the purpose and the
  version of the text), when, and how (which form). Withdrawal is as easy as giving it, and is
  recorded too.
- **PRIV-18 — Terms and privacy texts are versioned.** Acceptance stores the version; a material
  change asks again.
- **PRIV-19 — Cookies and trackers:** only strictly necessary cookies without consent. Anything else
  (analytics, marketing) waits for an explicit opt-in, and "refuse" is as easy as "accept".

## 7. Access to sensitive data

- **PRIV-20 — Need to know.** Sensitive records are visible only to the people whose role requires
  it, decided by policies on the server (security standard, SEC-Z3); visibility ends when the need
  ends (a case closed, a membership removed).
- **PRIV-21 — Every read is logged** as an access event in the audit log, with which fields were
  visible and on what basis (audit-log standard, section 4).
- **PRIV-22 — Lists show the minimum.** A list page shows what is needed to pick a record; the full
  record is opened (and logged) one at a time.

## 8. Personal data outside the product

- **PRIV-23 — Never in logs** (logging standard, sections 6 and 9), **never in the audit log's
  values** (audit-log standard, section 5).
- **PRIV-24 — Never in URLs.** No email, name, phone or free text in a path or query string: they end
  up in logs, browser history and referrers. Searches send their term in the query only when the
  access log drops query strings (logging standard, section 5); identifiers in URLs are opaque ids.
- **PRIV-25 — Never in analytics or error tracking.** Error tracking runs the same scrubber as the
  logs, with default PII collection off and no session replay of screens that show personal data.
  Analytics, if any, is first-party or anonymous, without personal data or cross-site tracking.
- **PRIV-26 — Emails carry the minimum.** A notification about a sensitive record says that
  something happened and links to the app; it never includes the sensitive content.
- **PRIV-27 — Non-production holds no real personal data** (CI/CD standard, CI-6); demo and test
  data are fictitious.

## 9. Breach notification

- **PRIV-28 — A breach is assessed at once**: what data, how many people, what risk to them. The
  assessment, the decision and the timeline are recorded, even when nothing has to be notified.
- **PRIV-29 — Deadlines from the applicable law**, for example:
  - the supervisory authority **within 72 hours** of becoming aware of the breach (GDPR), unless it is
    unlikely to result in a risk;
  - the authority **as soon as possible** when the breach is likely to result in a high risk (Swiss
    nLPD);
  - the people affected, without undue delay, when the risk to them is high.
- **PRIV-30 — The procedure is written beforehand** with the incident response (security standard,
  section 11): who assesses, who notifies, the templates, and the contacts of the authorities.

## 10. Encryption

- **PRIV-31 — In transit:** HTTPS only (security standard, section 5), TLS between the service and
  its database when they are on different hosts, and to every partner.
- **PRIV-32 — At rest:** encrypted disks or the database's encryption at rest, encrypted backups
  (SEC-B1), and field-level encryption for the most sensitive fields where the product can work with
  it (identity numbers, documents). Keys outside the database, with a key id for rotation.

## 11. Sub-processors and data residency

- **PRIV-33 — Every sub-processor is listed** in the register: hosting, email, backups, error
  tracking, payment, partners. For each: what data it receives, the country, the contract (a data
  processing agreement) and its safeguards for transfers.
- **PRIV-34 — Residency is a decision.** Where the data lives (e.g. in the country or region of its
  users) is chosen per project and applies to the database, backups and sub-processors. A
  sub-processor outside that region needs a legal basis for the transfer.
- **PRIV-35 — The public privacy notice** matches the register: purposes, legal bases, retention,
  sub-processors, rights and contact.

## 12. Privacy by default

- **PRIV-36 — Off until turned on:** public profiles and listings, sharing with other organisations,
  marketing emails, optional analytics. The person (or their organisation's administrator) opts in,
  and the opt-in is recorded.
- **PRIV-37 — The least visible setting is the default** wherever a choice exists (visibility,
  retention, notification content).

## 13. Data protection impact assessment

- **PRIV-38 — A DPIA before high-risk processing**: sensitive data at scale, systematic monitoring,
  profiling or automated decisions about people, new technology on personal data. It describes the
  processing, its necessity, the risks to people and the measures, and is reviewed when the
  processing changes.
- The DPIA lives with the project's docs, is referenced by the decisions it led to, and is reviewed
  before go-live.

## 14. Checklist

- [ ] Every personal field classified; a data register with purpose, legal basis, retention, access and recipients per collection; changed with the code.
- [ ] Forms collect only what their purpose needs; no reuse for a new purpose without a new legal basis.
- [ ] A retention per data type, enforced by TTL or jobs; backups rotate and restores re-apply erasures.
- [ ] An erasure ledger (opaque ids and destroyed key ids only) kept outside the backups and re-applied automatically after every restore, before the system serves traffic; the restore fails if it fails.
- [ ] With crypto-shredding: per-person keys, the key vault backed up separately, destroyed key ids re-applied after a vault restore.
- [ ] Backup retention bounded and stated in the register and privacy notice; the restore drill proves an erased person stays erased.
- [ ] Self-service export; access history for sensitive records; rectification; erasure with anonymisation where records must stay, through one shared function, proven by a test.
- [ ] Consent and terms acceptance recorded with versions; non-essential cookies only after opt-in.
- [ ] Sensitive records visible on need to know, every read logged, lists minimal.
- [ ] No personal data in logs, audit values, URLs, analytics, error tracking or notification emails; no real data outside production.
- [ ] A written breach procedure with the deadlines of the applicable law; every breach assessed and recorded.
- [ ] Encryption in transit and at rest, encrypted backups, field-level encryption for the most sensitive fields where possible.
- [ ] Sub-processors listed with contracts and countries; data residency decided; the privacy notice matches the register.
- [ ] Exposure is opt-in (listings, sharing, marketing).
- [ ] A DPIA for high-risk processing, reviewed before go-live.
