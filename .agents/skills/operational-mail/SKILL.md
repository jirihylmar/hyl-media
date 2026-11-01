---
name: operational-mail
description: Where a project's operational mail goes (CloudWatch alarms through SNS email, notifications, reports, mail it sends through SES) and how its SNS email subscriptions get confirmed - the central address for the project's AWS account (aws@hub440.cz or aws@hylmar.eu, never the account's root address aws-<nnn>@), a sender name and subject that say which project and account, confirmation by the administrator side through the mailbox, never by the link. Use before creating or changing an alarm, an SNS topic or email subscription, mail sent through SES, or any mail a project sends to the operator.
---

# Operational mail

Read `.claude/skills/operational-mail/SKILL.md` completely and follow it: its rule section is the
agreed rule, word for word, and its numbered steps are the procedure.

In short: send every alarm, notification, report and SES mail to the central address for the
account the project deploys into (aws@hub440.cz or aws@hylmar.eu, never the account's root address
aws-<nnn>@), taken as a parameter; name topics, alarms and subjects so the mail says which
project and account it is from, in the one form the rule gives (the origin repository's name, the
account's name and 12-digit id); never confirm an SNS email subscription by its link, and ask
hyl-resources-manager through the request mailbox the same day instead. Do not restate or reword
the rule in Codex prose; the canonical file is the only text.
