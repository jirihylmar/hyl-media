---
name: operational-mail
description: Where a project's operational mail goes (CloudWatch alarms through SNS email, notifications, reports) and how its SNS email subscriptions get confirmed - the one central address of the project's AWS account, never a new address, group or alias; a sender name and subject that say which project and account; confirmation by the administrator side through the mailbox, never by the link. Invoke before creating or changing a CloudWatch alarm, an SNS topic or email subscription, or any mail a project sends to the operator, and when a subscription disappears or reads pending or not authenticated.
---

# operational-mail

The operator reads one place for the estate's operational mail, and every project sends there. A
project does not design any of it: it takes the central address as a parameter, names its mail so the
operator sees at once which project and account it is from, and leaves the confirmation of an SNS
email subscription to the administrator side (hyl-resources-manager), which confirms it with a
signed call so that no link in any mail can later unsubscribe it.

This skill is information, not an order: it binds nothing until this project sends operational mail.

## The rule

Agreed on 2026-10-26 between the operator's control room (hyl-resources-manager) and
syndicate-playbooks-examples, and approved by the operator. The operator's words: *"the rule is that
we should not create tons of new addresses. they should yous the central on and emails there whould
be identified by subject, who what"*. The naming forms were added the same day, after the first three
projects had written "<project> <account>" three different ways (the operator: *"it will spread as
virus through the syndicate and we will not be able to identify enything"*), and approved by the
operator: the full project name in alarm names, and code in a nested repository named for the
project that manages it.

<!-- RULE BEGIN -->
## Operational mail: alarms and notifications

- **One address.** Every operational mail a project sends goes to the central address of your account's organisation (below). That covers a CloudWatch alarm through an SNS email subscription, a notification it publishes, and a report.
  - aws@hylmar.eu if the account you deploy into is 287773673380, 299025166536, 126697143436 or 911926883318; otherwise aws@hub440.cz.
  - The list changes rarely. As a backstop, the mailbox request for a confirmation names the address used, and the administrator side corrects it before confirming.
  - Take the address as a parameter set to that value (for example AlarmEmail), never as a default of the project's own.
  - Never create or ask for a new address, group or alias for it.

- **Names say which project and which account, in one form, never abbreviated.**
  - `<project>` is this project's estate identity: the name of its origin repository (the repository whose progress.json manages the code), lowercased, with `.` turned into `-`, the identity /syndicate-request uses. Never a resource prefix, a project code, a product or a family name. Code in a repository nested inside the project that manages it is named for the managing project; the nested repository may appear inside `<what>`.
  - `<account>` is the account's name followed by its 12-digit id; the digits are the identity. Read both live: the id with `aws sts get-caller-identity`, the name with `aws account get-account-information --query AccountName`. If the name cannot be read, give the id in the confirmation request and hyl-resources-manager names the account in its answer, before it confirms.
  - The sender: every SNS topic with an email subscription sets DisplayName to `<project> <account name> <account id>`, at most 100 characters (letters, digits, hyphen, underscore, space). Example: `nutritech-pdsm-orchestrator NUTRITECH 132848804566`.
  - The alarm name, which CloudWatch writes into the subject as ALARM: "<alarm name>" in <region>: `<project>-<what>`, lowercase with hyphens, at most 53 characters in eu-central-1, eu-west-1 and us-east-1 (elsewhere 76 minus the length of the region's display name). Shorten `<what>`, never `<project>`. A project that mails from more than one account starts `<what>` with the account name.
  - A message the project publishes itself: Subject `<project>: <what>`, under 100 characters. EventBridge mail arrives with the subject "AWS Notification Message", so its text starts with `<project> <account name> <account id>:`.
  - A new email topic is named `<project>-alarms` or `<project>-<purpose>` and carries the tag `origin=<owner>/<repository>`. Existing topic names stay.
  - Code one project supplies and another deploys (a sign-in kit) is named for the deploying project: `<project>-<app id>-<what>`.
  - Renaming an alarm replaces it: every policy that names its ARN (a topic policy's aws:SourceArn, a role's statements) moves in the same change, or the mail stops silently. A new or renamed email subscription is confirmed by hyl-resources-manager like any other.
  - hyl-resources-manager checks every registered account against these forms; a name that differs is reported as drift. Existing names are renamed by their owners, in the order hyl-resources-manager sets.
- **Confirmation is the administrator side's.** Never confirm an SNS subscription by its link, and never ask the operator to.
  - The same day a change creates an email subscription, ask through the mailbox (--to hyl-resources-manager), naming the topic ARN, the account and the address it mails.
  - The administrator side confirms it with a signed call within the 2 days (48 hours) the confirmation stays valid, and records it.
  - Until then the subscription is pending and delivers nothing.
- **Silence is a fault.** If a subscription the project relies on disappears, or reads pending or not authenticated, say so through the mailbox at once. A missing alarm path looks like a quiet system.
<!-- RULE END -->

## The steps

1. **Before the change.** Give the stack (or script) a parameter for the address, for example
   `AlarmEmail`, set to the central address of the account it deploys into (the rule above), with no default
   of the project's own. Name the topic, its `DisplayName`, every alarm and every `Subject` in the forms
   the rule gives, from this project's origin repository name and the account read live.
2. **Deploy as the project always does.** The subscription is created pending; the confirmation mail
   goes to the central address, where the administrator side reads it. Do not open, forward or ask
   anyone to click its link.
3. **The same day, ask for the confirmation** through the request mailbox, `/syndicate-request`:

   ```bash
   bash .claude/skills/syndicate-request/request.sh send --to hyl-resources-manager \
     --title "Confirm the SNS email subscription on <topic name> (<account>)" < request.md
   ```

   In `request.md`: the topic ARN, the account, the address it mails, the commit or change set that
   created it, and when. No credential and nothing private: everyone with mailbox access reads it.
4. **Record and carry on.** Note the branch and commit `send` printed in `session_notes.md` and on the
   task that waits. The answer comes back as an estate notice or a `session_notes.md` entry; do not
   wait in the session. A confirmation not answered within two days (48 hours) has expired: ask again.
5. **Check, not assume.** The project's own checks read its subscriptions
   (`aws sns list-subscriptions-by-topic`) and treat one that is missing, `PendingConfirmation`, or
   whose attributes show `ConfirmationWasAuthenticated` false as a fault to report through the
   mailbox, at once.

## Why it exists

On 2026-10-26 nutritech-pdsm-orchestrator's alarm subscription was confirmed by something in the
mail path that follows links. A subscription confirmed by its link can be unsubscribed by the link in
any later mail, silently, and the alarm path then looks like a quiet system. The administrator side
measured that a signed `confirm-subscription --authenticate-on-unsubscribe true` with the mail's
token makes the subscription removable only with AWS credentials, even after a link was followed.
Hence one central address it can read, and the confirmation left to it.
