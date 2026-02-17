# Backend Service TODO

## Non-Negotiable Rules
- **Review all dependent modules before coding. No assumptions about data flow.** <!-- STATUS: 🔲 Pending - Full dependency audit not yet started. -->
- **Keep navigation semantics intact**: the transition order between landing → precombat → battle must remain unchanged unless specifically instructed. <!-- STATUS: 🔲 Pending - Client navigation untouched until backend integration work begins. -->
- **Avoid touching battle UI files** beyond necessary hook invocations; this checklist focuses on data handoff only. <!-- STATUS: 🔲 Pending - Awaiting backend implementation phase. -->
- **Annotate new orchestration logic** with comments describing the data pipeline and reasoning. <!-- STATUS: 🔲 Pending - No backend orchestration changes committed yet. -->

## Groundwork Spec
- **[Scope Alignment]** Audit existing client modules (`src/utils/rosterStorage.ts`, `src/state/UIState.ts`, `src/ui/screens/LandingScreen.ts`) and planned backend touchpoints to catalog every read/write workflow that currently relies on localStorage. Document discovered entry points in this file before any implementation. <!-- STATUS: 🔲 Pending - LocalStorage workflow catalog not compiled. -->
- **[Data Model Definition]** Design the MongoDB schema for generals. Capture identity, commissioning metadata (region/school keys & labels), stats, service record, timestamps, and future-facing fields (e.g., medals). Record schema shape inside `server/models/GeneralProfile.ts` with explanatory comments. <!-- STATUS: 🔲 Pending - Schema design outstanding. -->
- **[API Surface]** Enumerate required REST endpoints (create/list/update/delete generals, roster export/import, mission assignment hooks). For each endpoint, describe request/response payloads and reference the client modules that will consume them. <!-- STATUS: 🔲 Pending - Endpoint contract not drafted. -->
- **[Environment Contract]** Specify required environment variables (`MONGODB_URI`, `MONGODB_DB_NAME`, optional `PORT`) and default fallbacks for local dev. Place the contract in a dedicated `server/config/environment.ts`, with comments noting deployment expectations. <!-- STATUS: 🔲 Pending - Environment configuration unspecified. -->
- **[Testing Strategy]** Plan both integration tests (hitting in-memory Mongo or `mongodb-memory-server`) and client-side regression checks. List necessary fixtures (sample general profile JSON) and where they live. <!-- STATUS: 🔲 Pending - Testing approach requires definition. -->
- **[Documentation Targets]** Decide whether to extend `GameRulesArchitecture.md` or create `BackendArchitecture.md` to describe service boundaries, request lifecycles, and data persistence rules post-implementation. <!-- STATUS: 🔲 Pending - Documentation destination undecided. -->

## Infrastructure Setup
- **[BACKEND-1]** Add backend dependencies: `express`, `cors`, `dotenv`, `mongodb` (or `mongoose`), `zod` for validation, plus nodemon/ts-node for development. Update `package.json` scripts with `"server:dev"` and `"server:build"` entries. <!-- STATUS: 🔲 Pending - Dependencies not installed. -->
- **[BACKEND-2]** Create `server/` directory with TypeScript configuration (`tsconfig.server.json`) targeting Node runtime, ensuring it does not collide with the existing Vite client build. <!-- STATUS: 🔲 Pending - Server scaffold absent. -->
- **[BACKEND-3]** Implement `server/config/environment.ts` to load `.env` values, validate mandatory keys, and expose typed getters. Include comments indicating which client modules depend on each value. <!-- STATUS: 🔲 Pending - Environment loader not implemented. -->
- **[BACKEND-4]** Scaffold `server/db/mongoClient.ts` that instantiates a singleton MongoDB client, handles graceful shutdown, and exports helper methods (`getGeneralCollection()`). Annotate connection lifecycle decisions. <!-- STATUS: 🔲 Pending - Mongo client utilities missing. -->
- **[BACKEND-5]** Define `server/models/GeneralProfile.ts` with TypeScript interfaces + zod validation schemas mirroring the Mongo collection. Include conversion helpers from client payloads to DB documents (and vice versa) with comments explaining each transformation step. <!-- STATUS: 🔲 Pending - Model definition outstanding. -->

## API Endpoints & Routing
- **[API-1]** Create `server/routes/generals.ts` containing Express routers for: <!-- STATUS: 🔲 Pending - Route handlers not created. -->
  - `GET /api/generals` → list all profiles (with optional filters by region/school). <!-- STATUS: 🔲 Pending - Implementation TBD. -->
  - `POST /api/generals` → insert a new profile from commissioning form payload. <!-- STATUS: 🔲 Pending - Implementation TBD. -->
  - `GET /api/generals/:id` → fetch a single profile (used by View button & mission gating). <!-- STATUS: 🔲 Pending - Implementation TBD. -->
  - `PATCH /api/generals/:id` → update stats/service records post-mission. <!-- STATUS: 🔲 Pending - Implementation TBD. -->
  - `DELETE /api/generals/:id` → retire a commander. <!-- STATUS: 🔲 Pending - Implementation TBD. -->
  Include JSON schema validation and detailed comments referencing the client calls that will consume each endpoint. <!-- STATUS: 🔲 Pending - Validation scaffolding not started. -->
- **[API-2]** Add `server/routes/roster.ts` for roster-level operations (`POST /api/roster/import`, `GET /api/roster/export`). Ensure payload structure matches current `saveRosterToFile()` expectations and document incompatibilities. <!-- STATUS: 🔲 Pending - Roster routes not implemented. -->
- **[API-3]** Wire an Express app in `server/index.ts` that mounts JSON middleware, CORS (locked to dev origin `http://localhost:5173` by default), health checks, and the new routers. Provide logging hooks with TODOs for production observability. <!-- STATUS: 🔲 Pending - Express bootstrap not created. -->
- **[API-4]** Document request/response examples in comments adjacent to each handler for quick AI/code review reference. <!-- STATUS: 🔲 Pending - Documentation snippets absent. -->

## Client Integration Tasks
- **[CLIENT-1]** Refactor `src/utils/rosterStorage.ts` to fetch from the backend instead of localStorage. Implement an abstraction layer (`RosterService`) that internally calls `fetch` and gracefully handles offline mode (fallback to in-memory cache). Comment on retry/backoff decisions. <!-- STATUS: 🔲 Pending - Client still uses localStorage. -->
- **[CLIENT-2]** Update `LandingScreen.ts` commissioning flow to await `POST /api/generals`, then refresh the roster list via `GET /api/generals`. Add inline comments describing how the UI state mirrors backend responses. <!-- STATUS: 🔲 Pending - Landing screen unaware of backend. -->
- **[CLIENT-3]** Modify `viewGeneralProfile()` to call `GET /api/generals/:id`, populate the detail panel from the response, and cache the payload in `UIState` for mission filtering logic. <!-- STATUS: 🔲 Pending - Detail view remains local-only. -->
- **[CLIENT-4]** Ensure mission eligibility heuristics migrate to server-computed fields if necessary; if logic remains client-side, document assumptions about data freshness and eventual consistency. <!-- STATUS: 🔲 Pending - Heuristic strategy undecided. -->
- **[CLIENT-5]** Update import/export buttons to interact with `/api/roster/*` endpoints. Include TODO markers if a streaming download is required. <!-- STATUS: 🔲 Pending - Buttons still invoke local storage file helpers. -->

## Validation & Testing
- **[TEST-1]** Introduce backend tests under `server/tests/` using Jest or Vitest (Node environment). Cover happy-path CRUD and failure cases (invalid payload, duplicate name). <!-- STATUS: 🔲 Pending - Test suite not created. -->
- **[TEST-2]** Add integration smoke tests that spin up the Express app against an in-memory Mongo, verifying full request lifecycle for commissioning a general. <!-- STATUS: 🔲 Pending - Integration smoke tests absent. -->
- **[TEST-3]** Extend existing client tests (if any) or add new ones to mock the backend API, ensuring UI flows remain stable. <!-- STATUS: 🔲 Pending - Client tests not updated. -->
- **[TEST-4]** Document manual QA steps: start server, seed sample generals, walk through landing → precombat path, confirm navigation order remains untouched. <!-- STATUS: 🔲 Pending - QA checklist not executed. -->

## Deployment & Observability
- **[DEPLOY-1]** Draft deployment checklist covering environment setup, `.env` secrets management, build commands, and expected port bindings. Place the checklist in `BackendArchitecture.md` (or similar). <!-- STATUS: 🔲 Pending - Deployment checklist not drafted. -->
- **[DEPLOY-2]** Plan logging/monitoring hooks (e.g., request logging middleware, error tracking). Include TODO comments in `server/index.ts` indicating where to integrate real observability later. <!-- STATUS: 🔲 Pending - Observability plan absent. -->
- **[DEPLOY-3]** Outline rollback strategy: how to restore roster data if Mongo updates regress. Provide guidance on backup collections or export scripts. <!-- STATUS: 🔲 Pending - Rollback strategy undefined. -->

## Task Breakdown & Acceptance Criteria
- **[Task-01] Dependency Audit & Design (1 dev)** <!-- STATUS: 🔲 Pending - Groundwork spec incomplete. -->
  - Complete Groundwork Spec items; produce annotated notes in this file. <!-- STATUS: 🔲 Pending - Notes not produced. -->
  - Acceptance: All assumptions reviewed with references to source files and open questions captured as TODOs. <!-- STATUS: 🔲 Pending - Acceptance unmet. -->
- **[Task-02] Infrastructure & Config (1 dev)** <!-- STATUS: 🔲 Pending - Infrastructure setup not started. -->
  - Deliver `server/` scaffolding, environment loader, and Mongo client utilities with explanatory comments. <!-- STATUS: 🔲 Pending - Deliverables outstanding. -->
  - Acceptance: Server boots with `npm run server:dev` and connects to Mongo using `.env.local` sample. <!-- STATUS: 🔲 Pending - Boot verification not possible yet. -->
- **[Task-03] API Implementation (1-2 devs)** <!-- STATUS: 🔲 Pending - API layer untouched. -->
  - Implement `generals` and `roster` routes, validation, and error handling. Ensure every handler comment documents data flow and rationale. <!-- STATUS: 🔲 Pending - Implementation needed. -->
  - Acceptance: REST endpoints verified via integration tests; API documentation snippets added inline. <!-- STATUS: 🔲 Pending - Tests and docs not created. -->
- **[Task-04] Client Refactor (1-2 devs)** <!-- STATUS: 🔲 Pending - Client still local-only. -->
  - Replace localStorage access with backend calls, preserving navigation order landing → precombat → battle. Include comments describing data pipeline. <!-- STATUS: 🔲 Pending - Refactor not started. -->
  - Acceptance: UI commissioning flow succeeds end-to-end against live server; mission selection still behaves as before. <!-- STATUS: 🔲 Pending - Acceptance criteria unmet. -->
- **[Task-05] Testing & Docs (1 dev)** <!-- STATUS: 🔲 Pending - Testing/doc updates outstanding. -->
  - Ship automated tests (backend + client mocks) and update architecture docs. Maintain the non-negotiable comment guidelines throughout. <!-- STATUS: 🔲 Pending - Deliverables not shipped. -->
  - Acceptance: Test suite passes; doc changes merged; manual QA checklist executed without regressions. <!-- STATUS: 🔲 Pending - Acceptance criteria unmet. -->

## Open Questions & Follow-Ups
- **[Q1]** Do we require authentication/authorization for roster management? If yes, scope a follow-up ticket for auth middleware. <!-- STATUS: 🔲 Pending - Decision not documented. -->
- **[Q2]** Should mission history (per general) be stored as embedded docs or referenced collections? Capture decision rationale before coding. <!-- STATUS: 🔲 Pending - Storage strategy unresolved. -->
- **[Q3]** Are there performance constraints (e.g., max generals) that necessitate pagination or indexing strategy? Document findings in this file. <!-- STATUS: 🔲 Pending - Performance considerations unaddressed. -->

## Acceptance Checklist
- [ ] Dependencies installed and server scaffolded. <!-- STATUS: 🔲 Pending - No backend scaffolding present. -->
- [ ] Mongo connections reliable with documented retry strategy. <!-- STATUS: 🔲 Pending - Connection strategy undefined. -->
- [ ] REST endpoints implemented with validation and comments on data flow. <!-- STATUS: 🔲 Pending - Endpoints not built. -->
- [ ] Frontend updated to consume backend without breaking navigation semantics. <!-- STATUS: 🔲 Pending - Frontend still uses local storage. -->
- [ ] Automated tests and manual QA steps executed. <!-- STATUS: 🔲 Pending - Validation steps outstanding. -->
- [ ] Documentation updated with backend architecture narrative and TODO resolutions. <!-- STATUS: 🔲 Pending - Documentation not updated. -->
