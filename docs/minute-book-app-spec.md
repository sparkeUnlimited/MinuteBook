# Minute Book Generator — Build Spec

## Overview
Build a standalone vanilla JS web app that generates Ontario corporate minute
book documents (resolutions, registers) as PDFs. Hosted on AWS Amplify.
Reused annually for recurring resolutions, plus ad-hoc as needed.

Tech constraints:
- Vanilla JS, HTML, CSS — no framework
- jsPDF for PDF generation (doc.html() method)
- Web Share API on iOS/iPadOS for saving to iCloud Drive; plain download
  fallback for macOS Safari
- Data persistence: AWS AppSync (GraphQL) + DynamoDB — not localStorage.
  This maintains a durable history across devices rather than tying records
  to one browser.
- Deployed via AWS Amplify as a static site

## Phase 1: Project scaffold
- Create index.html, styles.css, app.js, /templates folder, /schema folder
- Set up basic layout: sidebar nav (Corp Info / Directors / Shares / Banking
  / Annual Resolutions / Ad Hoc Resolutions / Document Registry), main panel
  for active form/view
- Include jsPDF via CDN script tag

## Phase 2: Backend — AWS AppSync + DynamoDB

### Data model (GraphQL schema)
```graphql
type CorpInfo {
  id: ID!
  legalName: String!
  tradeNames: [String]
  corporationNumber: String!
  businessNumber: String
  jurisdiction: String!
  incorporationDate: AWSDate!
  registeredOffice: String!
  mailingAddress: String
  updatedAt: AWSDateTime!
}

type Director {
  id: ID!
  name: String!
  address: String!
  titles: [String!]!
  appointmentDate: AWSDate!
  isSoleDirector: Boolean!
}

type ShareClass {
  id: ID!
  className: String!
  authorized: Int!
  issued: Int!
  rightsRestrictions: String
}

type Shareholder {
  id: ID!
  name: String!
  shareClassId: ID!
  quantity: Int!
  certificateNumber: String
}

type BankingInfo {
  id: ID!
  bankName: String!
  branchAddress: String!
  signingOfficers: [String!]!
  accountTypes: [String!]!
}

type AnnualResolution {
  id: ID!
  fiscalYearCovered: String!
  financialStatementsApproved: Boolean!
  directorContinuation: Boolean!
  dividendDeclared: Boolean!
  dividendAmount: Float
  dividendClass: String
  auditWaiver: Boolean!
  dateSigned: AWSDate
  pdfGenerated: Boolean!
  createdAt: AWSDateTime!
}

type AdHocResolution {
  id: ID!
  type: String!
  customTitle: String
  date: AWSDate!
  details: String!
  dateSigned: AWSDate
  pdfGenerated: Boolean!
  createdAt: AWSDateTime!
}

type DocumentRegistryEntry {
  id: ID!
  documentId: ID!
  documentType: String!
  periodCovered: String!
  dateSigned: AWSDate
  pdfGenerated: Boolean!
}
```

### Auth
- Use AWS AppSync with Cognito User Pool auth (single user — just Ryan)
- Simplest setup: one Cognito user, API key auth is NOT recommended here
  since this is durable legal data — use Cognito so access is tied to a
  real login, not an embeddable key
- Amplify CLI (`amplify add auth`, `amplify add api`) scaffolds both Cognito
  and AppSync together with sane defaults — use this rather than hand-
  rolling the CloudFormation

### Client-side data layer
- Use the Amplify JS library directly (vanilla JS, not a framework):
  ```js
  import { generateClient } from 'aws-amplify/api';
  const client = generateClient();
  ```
- On app load: run listCorpInfo, listDirectors, listShareClasses, etc. to
  hydrate current state
- On every field save: fire the corresponding mutation (createX/updateX)
- AnnualResolution and AdHocResolution records are immutable once
  dateSigned is set — enforce this in the UI (disable edit) even though
  DynamoDB won't stop you from mutating it

### Offline consideration
- Skip Amplify DataStore (adds sync/conflict-resolution complexity not
  worth it for a low-frequency tool). Assume online use; show a simple
  "couldn't save, check connection" error if a mutation fails.

### Sign-in flow
- Simple Cognito-hosted UI or basic email/password login screen on app
  load, gating access to the rest of the app
- Session persists via Amplify's Auth session handling — no need to log in
  every visit

### Open question — PDF file storage
Current scope: DynamoDB holds metadata only (dateSigned, pdfGenerated) —
the actual PDF file lives wherever it was saved via Share/iCloud, not in
the backend. If retrieving the actual PDF from any device later is
needed, add an S3 + Amplify Storage piece (not in initial scope).

## Phase 3: Form rendering engine
- Write a generic function that takes a schema section + current data and
  renders the appropriate input (text/select/multiselect/repeatable/boolean/
  conditional) into the DOM
- Repeatable sections (shareClasses, shareholders, adHocResolutions) need
  add/remove row buttons
- Conditional fields (e.g., dividendAmount) show/hide based on a sibling
  boolean field
- On save, validate required fields per section before allowing PDF
  generation for that section

## Phase 4: Document templates
Create one template function per document type in /templates, each taking
the full data object and returning an HTML string:
- organizationalResolution.js (one-time, at incorporation)
- annualResolution.js (parameterized by fiscal year)
- bankingResolution.js
- shareRegister.js (table of all classes/holdings, regenerated on demand —
  not a "resolution" but a standing register)
- directorRegister.js (standing register)
- adHocResolution.js (generic template driven by adHocResolutions entry type)

Each template should include: corp name/number header, resolution body text
using proper legal phrasing ("WHEREAS... IT IS RESOLVED THAT..."), a
signature block for the sole director, and a date line.

## Phase 5: PDF generation + save flow
- "Generate PDF" button per document, calls jsPDF doc.html() on the rendered
  template
- Implement the share/download logic: navigator.canShare check → Web Share
  API with file on iOS/iPadOS, plain anchor download fallback on macOS
- On successful generation, update that document's entry in
  DocumentRegistryEntry (dateSigned = today, pdfGenerated = true) via an
  AppSync mutation

## Phase 6: Document Registry / Status view
- Table view showing every document: type, period covered, status (Complete
  / Not yet generated / Overdue)
- "Overdue" logic: annual resolution for the current fiscal year doesn't
  exist by [X months] after fiscal year end — flag in red
- "New Annual Resolution" button that creates a fresh AnnualResolution
  record pre-filled with the new fiscal year, carrying forward static info
  (corp name, director, etc.) from last year's entry

## Phase 7: Print stylesheet
- @media print rules that hide all UI chrome and show only the active
  .resolution-doc container — this doubles as the fallback path if jsPDF
  ever has layout issues (user can just Cmd+P as backup)

## Phase 8: Polish
- Simple nav highlighting for current section
- Confirmation dialog before removing repeatable rows (share classes, ad hoc
  resolutions) since this is legal record data
- Basic responsive layout for iPad/iPhone use

## Notes for Claude Code
- Single user, Cognito auth — no multi-tenant concerns
- Follow the existing print-to-PDF pattern already used in the
  sparke-quote-tool.html file if referencing prior conventions
- Keep each template function pure (data in, HTML string out) so they're
  easy to test independently
- Prioritize Phases 1–5 as the MVP; Phase 6 (registry) can follow once core
  generation works
- Open decision not yet made: single HTML page with client-side routing
  between sections, vs. separate HTML files per section — propose an
  approach if not otherwise specified
