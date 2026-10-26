---
name: operational-mail
description: Where a project's operational mail goes (CloudWatch alarms through SNS email, notifications, reports) and how its SNS email subscriptions get confirmed - the central address of the project's AWS account, a sender name and subject that say which project and account, confirmation by the administrator side through the mailbox, never by the link. Use before creating or changing an alarm, an SNS topic or email subscription, or any mail a project sends to the operator.
---

# Operational mail

Read `.claude/skills/operational-mail/SKILL.md` completely and follow it: its rule section is the
agreed rule, word for word, and its numbered steps are the procedure.

In short: send every alarm, notification and report to the central address of the account the
project deploys into, taken as a parameter; name topics, alarms and subjects so the mail says which
project and account it is from; never confirm an SNS email subscription by its link, and ask
hyl-resources-manager through the request mailbox the same day instead. Do not restate or reword
the rule in Codex prose; the canonical file is the only text.
