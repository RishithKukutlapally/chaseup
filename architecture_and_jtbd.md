# Northgate Chase: Architecture and Jobs to Be Done

## Executive summary

Northgate Chase is a case-tracking workspace for corporate KYC onboarding. It shows which documents each case still needs, who owes them, and when to follow up, and it drafts reminders that an RM reviews before anything is sent. The architecture keeps document state, reminder drafting, and human approval separate, so the tool assists people without making approval, screening, or credit decisions.

## Scope

The first two-week slice covers the document-chase stage, which takes a median of 17 of 62 days. The tool does not touch sanctions screening, UBO decisioning, credit approval, or core-banking account opening. Those stages appear only as read-only context, such as the "Blocked stages" panel.

## Jobs to be done

### RM: get the missing item to the client without a chase email

When a client file is missing a document, the RM wants the exact item requested from the client without writing and remembering a chase email, so nothing slips. The RM's situation is a portfolio of active corporate onboardings, each waiting on different documents. The motivation is avoiding half-week losses to repetitive email and forgotten follow-ups. The desired outcome is that every outstanding document has a dated request, a reviewed reminder, and a next follow-up date.

### Ops coordinator: prioritize chasing from one queue

When Ops opens the queue, the coordinator wants to see what is missing, how long it has waited, and who owes it, so chasing is prioritized rather than done by searching inboxes. The desired outcome is that overdue items are reachable in two clicks, and the queue sorts by the oldest waiting item.

### KYC analyst: start as soon as the file is complete

When ownership extraction is blocked by a missing registry extract or org chart, the analyst wants that request raised with full case context. The analyst is a secondary user. The desired outcome is a linked request from the blocked UBO item to the RM, so analysis starts when the file is complete rather than after a discovery email thread.

### COO: fund the right fix

The COO wants to see which stage holds cases and what it costs, so funding goes to the correct improvement. The desired outcome is a stage view with median days per stage and chase-round distribution, with no credit memo content visible.

### Corporate client: send everything once

The client wants one clear list of outstanding documents with a deadline, so everything is sent in a single pass. The client does not use Northgate Chase directly. The client's experience is shaped by the reminder drafts, which must list specific documents, due dates, and the RM's name.

## Architecture

### Layers

The system has five layers. A presentation layer covers the shared navigation shell and the five screens: chase queue, case detail, reminder composer, stage analytics, and analyst handoff. Components are the status chip, checklist row, timeline event, and draft card, reused across screens. An API layer, implemented as a backend-for-frontend, serves each screen with role-scoped data and enforces authorization. A workflow service owns the document state model and case timeline. A messaging and scheduling service drafts reminders, holds them for approval, and sends approved messages through the bank's existing mail gateway. An analytics service computes stage durations and chase-round counts from the case event log.

### Document state model

Each document item moves through a small set of states: requested, received, overdue, and waived. Each item records its category, owner (client or internal), request date, chase round (1 to 3), and the case it belongs to. The overdue state is derived from a threshold that is still an assumption and must be confirmed with Ops in week one. Waived is a human decision with a recorded reason. This model is the single source for the checklist, the status chips, the queue aging columns, and the analytics. Agreeing it with Ops is the first engineering dependency.

### Event log and timeline

Every request, reminder draft, approval, send, receipt, and waiver is written as an immutable event on the case. The timeline in the case detail view reads from this log, and the analytics service computes metrics from it. Storing events rather than only current state makes chase-round counts and time-to-receipt measurable from the start, which the pilot depends on.

### Reminder drafting and approval

Reminder drafts are generated from templates in the first release. Each draft lists the specific outstanding documents, the due date, and the RM's name. A draft is created in a pending state and cannot be sent until an RM explicitly approves it, either immediately or by scheduling. The send action is a single gated operation, and the system records who approved it. Template-based drafting is deliberate for the pilot: it is predictable, easy to review, and avoids generating client-facing text that has not been checked. Any later move to generated wording would sit behind the same approval gate.

### Data ingestion and history

The first slice uses three years of chase emails. A one-time ingestion job parses case IDs from subject lines, classifies requested document types against an agreed taxonomy, and estimates time to receipt per type. This is a batch analysis pipeline, separate from the live workflow. Subject-line case IDs may be unreliable for some cases, so the pipeline records match confidence and reports unmatched emails rather than assigning them silently. Ingested history feeds the analytics and the taxonomy, not the live queue.

### Integrations

The design assumes four integration points, each to be confirmed with the bank's platform owners. The existing KYC case system is the source of case, client, and RM records, read at first and written only through an agreed interface. The document store provides document metadata and receipt confirmation. The mail gateway sends approved reminders. Core banking and credit systems are not integrated in this slice; stage durations for those stages come from the existing reporting extract.

### Security, privacy, and controls

Chase emails and case records contain personal and corporate information. Role-based access limits each user to their own portfolio, with Ops seeing the queue and the COO seeing aggregated analytics only. Credit memo content is excluded from every data path in this slice, not merely hidden in the interface. Personal data stays within existing bank data controls, with masking in non-production environments. The prototype uses only synthetic data. All actions that change case state or send messages are logged with actor, time, and reason.

### Environments and delivery

The Stitch prototype is a visual artifact used to test layout and interaction with users. Engineering builds from the agreed state model and API contracts, not from prototype markup. The pilot runs in production-like controls with one RM team and the Ops coordinators, with a comparison group continuing the current process.

## Open decisions

The overdue and due-today thresholds need confirmation with Ops. The document taxonomy needs agreement with two analysts. The mail gateway and KYC case system interfaces need confirmation with platform owners. The owner of the reminder template wording, typically Compliance or Ops, needs to be named before the pilot.

## Success measures for the pilot

Chase rounds per case, days in the chase stage, RM hours spent on follow-up, and the share of reminders sent on or before the due date should be measured against the comparison group. The baseline is the median of 17 chase-stage days and an average of three chase rounds per case.