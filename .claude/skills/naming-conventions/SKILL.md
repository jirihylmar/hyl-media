---
name: naming-conventions
description: How every name a project creates says whose it is - AWS resources (stacks, buckets, functions, roles, policies, topics, alarms, log groups, queues, tables), standing processes and containers start with the project's full origin repository name, never an abbreviation, and every AWS resource, new or existing, carries the tag origin=<owner>/<repository>. Invoke before naming or creating any of these, when writing or changing infrastructure code, when a name limit is too short, and when asked whose a resource is.
---

# naming-conventions

Anyone looking at the operator's accounts, hosts or inbox must be able to tell from a name alone which
project made it. A project does not invent a prefix: it uses the one identity the estate already gives
it, written in full, and it tags every AWS resource with where its code lives. The rule for operational
mail (sender, alarms, subjects) is `/operational-mail`; this skill is the same rule for every other name.

This skill is information, not an order: it binds a project when it creates or renames something.

## The rule

Agreed on 2026-10-26 by the operator, after a control-room alarm named "hrm-132" reached the shared inbox
(the operator: *"it will spread as virus through the syndicate and we will not be able to identify
enything"*; and, asked how far the rule reaches: *"New names + tag all"*).

<!-- RULE BEGIN -->
## Names say whose they are

- **`<project>`** is this project's estate identity: the name of its origin repository (the repository whose progress.json manages the code), lowercased, with `.` turned into `-`. It is the identity `/syndicate-request` uses. Never a resource prefix, a project code, a product or a family name (`nutritech-pdsm-orchestrator`, never `pdsm`; `hyl-resources-manager`, never `hrm`). Code in a repository nested inside the project that manages it is named for the managing project.
- **Every new name a project creates starts with `<project>-`:** CloudFormation and CDK stacks, Lambda functions, IAM roles and policies, SNS topics, CloudWatch alarms, log groups, SQS queues, DynamoDB tables, EventBridge rules, Step Functions, ECR repositories, and on a host its systemd units, timers and containers. The rest is `<what>`, lowercase with hyphens. An S3 bucket, whose name is global, is `<project>-<what>-<account id>`.
- **A name limit too short:** shorten `<what>`, never `<project>`. If `<project>` alone leaves no room (an S3 bucket 63, an IAM role or Lambda function 64), ask through the mailbox (`--to hyl-resources-manager`) for the agreed form before creating it; the answer is recorded and the check accepts it.
- **Every AWS resource carries the tag `origin=<owner>/<repository>`,** new and existing (for example `origin=DigitalHorizonCz/nutritech-pdsm-orchestrator`). Adding a tag replaces nothing, so existing resources get it now, through the project's own infrastructure code: in CDK one line at the app (`Tags.of(app).add('origin', '<owner>/<repository>')`), in CloudFormation the stack's tags, which propagate to the resources that take tags. For code in a nested repository the tag names the managing project's repository too, matching the name's prefix (booking-classic's code inside orchestrator-classic: `origin=master-goldsport/orchestrator-classic`).
- **A prefix AWS or CDK sets** does not break the rule: a log group under `/aws/lambda/` or `/aws/events/` conforms when what follows starts with `<project>-`, and a physical name CDK generates conforms when it starts with the project-prefixed stack name.
- **Existing names stay** until the owner rebuilds the resource anyway; it is then renamed to this form in the same change. Renaming only to rename is not asked, because a bucket, a table or a stack must be replaced to change its name.
- **Couplings move with a name.** A policy, a topic policy's `aws:SourceArn`, an alarm's target or a host's check that names the resource changes in the same change, or something stops silently. A deploy identity whose IAM policy allows only an old prefix (`pdsm-*`) is widened first, through the mailbox, before the first resource under the new name: that is a policy change hyl-resources-manager answers.
- **Code one project supplies and another deploys** (a sign-in kit) is named and tagged for the deploying project.
- **Operational mail** (sender, alarm names, subjects, topics) follows `/operational-mail`, which uses the same `<project>`.
- **An exception** (a resource that cannot be renamed without harm, such as a delegated hosted zone) is recorded by hyl-resources-manager for its account, asked for through the mailbox; the check reads it there.
- hyl-resources-manager checks the registered accounts: a resource created from 2026-10-26 on whose name does not start with a known project's name, and any resource without the `origin` tag, is reported as drift.
<!-- RULE END -->

## The steps

1. **Find `<project>`:** `basename -s .git "$(git remote get-url origin)" | tr 'A-Z.' 'a-z-'`. For code in a nested
   repository, the managing project's repository instead, for the name and for the tag alike. `<owner>/<repository>`
   for the tag is that origin's path as written (`DigitalHorizonCz/nutritech-pdsm-orchestrator`).
2. **Before a new resource:** name it `<project>-<what>` (a bucket `<project>-<what>-<account id>`), check its
   limit, and check that the deploy identity's policy allows that name; if it allows only an older prefix, ask
   through the mailbox first.
3. **Tag:** add `origin` once at the app or stack level in the infrastructure code, deploy, and read it back on a
   resource of each kind (`aws resourcegroupstaggingapi get-resources --tag-filters Key=origin,Values=<owner>/<repository>`).
   A resource made outside the infrastructure code is tagged with its service's own tag command and recorded.
4. **When rebuilding an existing resource anyway:** rename it to this form in the same change, with every coupling.
5. **On a host:** a unit, timer or container is `<project>-<what>`, and it is asked for first under the ask-first
   rule (`CLAUDE.md`, Critical Rule 14).

## Why it exists

On 2026-10-26 three projects wrote "project and account" three different ways into the shared inbox, and the
control room's own alarm read "hrm-132". Abbreviations need a table to read, and every new project would have
invented another. The full repository name needs none, the tag says where the code lives even where a name could
not be changed, and the check makes a deviation visible instead of letting it spread.
