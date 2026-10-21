---
name: central-sign-in
description: How an internal app of the operator gets a login, the tested way - Google or an emailed code through central access, started with one line to the operator - and when this does NOT apply (customer-facing products with their own accounts, mobile apps or Sign in with Apple keep their own). Invoke before adding, building, changing or fixing sign-in, login, authentication, a password or basic-auth guard, or access control for any page, dashboard, admin or project-management app, and when asked whether an app should use central access.
---

# central-sign-in

The operator's internal apps all sign in the same way, and that way is already built and proved:
the app's own sign-in page with **"Continue with Google"** and an **emailed code**, run by a central
access service that grants who may enter. A project does not design any of it. It asks for a join
in one line, and everything it needs arrives as a pull request: the kit, the settings, a guide and
the skills `/access-integrate` and `/access-maintain`, with the copy-as-is dialog (Google's own
branded button) and its tests.

This skill is information, not an order: it binds nothing until this project needs a login.

## The rule

The words below are the rule as agreed with central access. They equal Critical Rule 11 of the
playbook's `CLAUDE.md` template and the text of the estate notice `access-rules-2026-10-19`; the
three are kept equal by a test in the central repository.

<!-- RULE BEGIN -->
### 11. Sign-in Comes From Central Access

Agreed 2026-10-19; scope added 2026-10-21.

**Scope.** This rule is for the operator's internal apps: development tools, dashboards,
project-management and operations pages, apps whose users are the operator's own people. It does
not apply to customer-facing products with their own user ecosystem (their own customer accounts,
mobile apps, Sign in with Apple or other providers): those keep and build the sign-in they need,
and nothing here migrates them. An app without a login needs nothing from this rule until it gets
one. If an app with a login, or about to get one, is not clearly one kind or the other, ask the
operator once and record the answer next to this rule.

Every internal app with a login signs in the same way: Google and an emailed code, on the app's
own sign-in page ("Continue with Google" and an email field). Do not build anything else: no
password form, no user pool of its own, no shared or basic-auth password, no allow-list in code.

- To join, send the onboarding request to the operator in one line, or, when the central access
  session has already messaged this one, as a reply to it. Fields: app name and proposed app id;
  who uses it (the operator's own people); repo and the branch that deploys production; AWS
  account and Region; framework and rendering (single-page or server-rendered); pages and the roles
  each needs; who should sign in (or "the operator decides"); sender domain wanted (or "the
  default"); what guards the app today; this session's name.
- Register the owner-side tasks you receive through /add-work. Once the operator has scheduled the
  join (the owner-side tasks arrive from the central access session), these need no further word
  from the operator in this project: registering those tasks, merging the delivery pull request,
  integrating and deploying behind the old guard, the proof, and removing the old guard on
  central's go. Everything else follows this project's own checkpoints. The join package arrives
  as a pull request in this repository: merge it with a merge commit, record
  vendor/hyl-access-kit/, docs/central-access/ and .claude/skills/access-* as delivered and not
  hand-editable, and follow its guide and the skills /access-integrate and /access-maintain.
- Defaults, not questions: no support address; demo mode, if the app has one, comes before the
  session check and is guarded by a test that production never sets it.
- Keep the old guard until central access sends its go. Never record a listed address in tracked
  files.
- An internal app that already has its own login keeps it until the operator schedules the join;
  do not migrate it yourself.
<!-- RULE END -->

## What to do, in order

1. **Decide which kind of app this is**, from what the project already says about its users.
   - The operator's own people use it (a tool, dashboard, admin, report or project page): go on.
   - Customers or the public use it with their own accounts, a mobile app or a provider such as
     Apple: **stop here.** This rule does not apply; build what the product needs.
   - No login, and none planned: nothing to do.
   - Not clear: ask the operator once, and record the answer next to the rule in `CLAUDE.md`.
2. **Put the rule in this project's `CLAUDE.md`** if it is not there: replace an older copy of
   "Sign-in Comes From Central Access", keeping its number, or add it as the next Critical Rule.
3. **Send the onboarding request** to the operator as one line: start it with
   `Central access onboarding request`, then the fields in the order the rule lists them. The
   same line works as a reply when the central access session has messaged this one first.
   Write "the operator decides" or "the default" where you do not know; do not ask the operator
   field by field.
4. **Wait for the join**, without building anything in the meantime: no password form, no user
   pool, no basic auth, no allow-list. Keep whatever guard the app has today.
5. **When the owner-side tasks arrive**, register them with `/add-work` and carry them through:
   merge the delivery pull request with a merge commit, then follow `/access-integrate`. The
   delivered guide is the authority from then on; it carries the tested dialog, the session
   handling and the proofs.

## What the operator does

Only what central access asks for, at the moment it asks: deciding who may sign in, and, when the
app's Google client is created, two pages in the Google console, which central access names with
direct links. Nothing else in a join waits for the operator.
