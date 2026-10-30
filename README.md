# MiniTask Pro

MiniTask Pro is a responsive MERN company task manager with employee and admin workspaces, task assignment and review workflows, private user accounts, notifications, and persistent light/dark themes.

## Features and technology

- React 18 and Vite frontend with separate employee/admin workspaces, task assignment/editing, employee progress updates and submissions, review decisions, filters, reports, and notifications.
- Express and Mongoose API with employee-default public signup, safe admin bootstrap, bcrypt password hashing, rate-limited authentication, short-lived JWTs in HttpOnly cookies, and CSRF protection.
- Company task states: assigned, in progress, pending review, revision requested, approved, and rejected. Rejected tasks are terminal until an admin explicitly reopens them with a reason.
- Persistent notification and task activity collections, paginated employee/task lists, and database-derived dashboards/reports.
- Server-generated, persisted task deadline reminders delivered to the active assignee around 24 hours before the deadline.
- Responsive role-specific workspace navigation with an accessible off-canvas drawer on compact screens, database-backed weekly approval activity, and deterministic initials avatars rendered in the UI (no avatar images stored in MongoDB).
- MongoDB Atlas storage. The existing database remains `user` and the existing task collection remains `HR`.
- Responsive design, accessible form labels, loading/error/success states, and a theme preference saved in local storage.

## Project structure

```text
backend/
  src/
    middleware/  Authentication, CSRF, and API error handling
    models/      User, Task, Notification, and TaskActivity schemas
    routes/      Authentication, personal task, and company workspace API routes
    scripts/     Explicit admin account setup command
    app.js
    server.js
  .env.example
frontend/
  src/
    components/  Authentication and task UI
    App.jsx
    styles.css
  .env.example
  index.html
```

## Requirements

- Node.js 18 or newer and npm.
- MongoDB Atlas cluster credentials, with network access enabled for the local machine and deployed backend.

## Local setup

From the project root, install dependencies:

```powershell
npm.cmd install --prefix backend
npm.cmd install --prefix frontend
```

Create `backend/.env` from the safe template and fill it in locally:

```powershell
Copy-Item backend\.env.example backend\.env
```

Set these backend variables in `backend/.env`:

| Variable | Required value |
|---|---|
| `MONGODB_URI` | Your private Atlas connection string. |
| `JWT_SECRET` | Random secret of at least 32 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`; keep the output private. |
| `PORT` | `5000` for local development; the deployment runtime supplies a port where required. |
| `FRONTEND_URL` | Exact frontend origin, normally `http://localhost:5173`. Multiple approved origins may be comma-separated. |
| `NODE_ENV` | Set to `production` in production. Vercel is also detected for secure cookie behavior. |
| `CRON_SECRET` | Random secret used to authorize the scheduled deadline-reminder endpoint. Keep it private. |

The backend explicitly selects database `user`; the Task model explicitly selects collection `HR`. Neither setting should be changed during deployment.

Optionally copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL=http://localhost:5000`. The frontend defaults to this API URL only during local Vite development; production builds require `VITE_API_BASE_URL`. Vite variables are public; never put credentials or secrets in frontend variables.

Run the API and frontend in separate terminals from the project root:

```powershell
npm.cmd run dev:backend
npm.cmd run dev:frontend
```

Open the Vite URL (normally `http://localhost:5173`). Create an account on the signup screen to start using the dashboard.

### Create the first admin

1. Sign up normally through the UI using the account that should administer the workspace. Public signup always creates an employee; any supplied role field is ignored.
2. From the project root, promote that existing account through the explicit backend command:

   ```powershell
   npm.cmd --prefix backend run promote-admin -- --email="admin@example.com" --confirm
   ```

   Replace the example with the exact email used at signup. The command only promotes an existing user; it does not create an account. There is no public admin promotion endpoint. Verify the email and run the command only from an authorized environment with the backend's `MONGODB_URI` configured.

3. Refresh the browser session. Its role is loaded from the database, and the admin dashboard will appear.

Create additional team members through public signup; they remain employees by default.

## Authentication, authorization, and workflow

- Signup requires a name, valid email, and a password of 10–72 characters containing uppercase, lowercase, and numeric characters. Passwords are bcrypt-hashed before storage.
- Employee display names reuse the existing `fullName` field; older accounts without a name fall back to their email prefix. Initials avatars and their deterministic colors are generated in the frontend and are not persisted.
- Login errors are intentionally generic; signup rejects duplicate email addresses. Login/signup attempts are rate limited.
- The browser receives the session only in a server-set HttpOnly cookie. The cookie expires after one hour. The frontend keeps the CSRF token in memory and does not store authentication credentials in local storage.
- `GET /api/auth/me` restores the current user; `POST /api/auth/logout` clears the session cookie.
- All API routes require a valid session except health, CSRF-token issuance, and public login/signup. Admin-only routes use backend role middleware. Roles come from the database, never from request data.
- Employees only read and act on tasks assigned to their authenticated account. Admin task listing, assignment, reviews, employee directory/account activation, reports, and all notification reads have server-side role/scope checks. Deactivated employee accounts cannot log in or continue making authenticated requests; their task history remains stored.
- Task workflow transitions are validated server-side: employees start assigned/revision-requested work and submit notes plus an optional HTTP(S) link; admins decide pending submissions. Rejections and revision requests require meaningful feedback. A rejected task can only be reopened by an admin with a reason.
- Assignment, submission, review, and reopen actions are recorded in `taskactivities`; notifications are stored per recipient in `notifications`. The UI refreshes notifications periodically; no push delivery is claimed.
- The backend checks for reminders immediately after startup and every five minutes. It only considers company tasks with a current active employee assignee, a future due date within the next 24 hours, and an actionable status (`assigned`, `in_progress`, or `revision_requested`); submitted, approved, rejected, personal, and overdue tasks are excluded. When the service was offline, it catches up only for tasks that are still in the future and inside that 24-hour window. The notification's task, recipient, type, and deadline are protected by a MongoDB unique index, initialized at API startup, so restarts, overlapping scheduler runs, and multiple API workers do not create duplicate reminders. Existing notifications are unaffected by the optional title/deadline fields and partial index. Changing the assignee or due date gives the new recipient/deadline its own reminder identity. Reminders use the existing in-app notification feed; delivery depends on the API process running, so hosts that sleep or suspend the service can delay or miss checks.
- Legacy personal tasks continue to work under `/api/tasks` when owned by the signed-in employee. They are separate from assigned company workflow tasks, which cannot be edited or deleted through the legacy personal-task routes.
- Existing tasks without an `owner` remain in `user.HR`, are not deleted, and are hidden from all user accounts. Do not assign all legacy tasks to every user. If you need specific legacy records migrated, first create/verify the intended account, back up the collection, then use an authorized MongoDB administrator to set `owner` only on explicitly selected document IDs. For example, after replacing both placeholders with verified values:

  ```javascript
  db.HR.updateMany(
    { _id: { $in: [ObjectId("<selected-task-id>")] }, owner: { $exists: false } },
    { $set: { owner: ObjectId("<authorized-user-id>") } }
  )
  ```

  This operation updates existing documents but does not delete them. Verify the selected IDs and owner before running it.
- Existing user documents without a stored `role` are treated as employees by the schema and employee-directory queries. No collection is reset or dropped.

## API endpoints

- `GET /api/health` — API and database connection status (`503` while the database is disconnected).
- `GET /api/auth/csrf` — issue/restore the CSRF token used for state-changing requests.
- `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.
- `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/:id`, `DELETE /api/tasks/:id`.
- Task `PATCH` accepts `completed`, `title`, and/or `description`.
- `/api/workspace/dashboard` returns role-scoped task counts and the last seven UTC days of recorded approvals; `/api/workspace/tasks`, `/api/workspace/notifications`, and `/api/workspace/notifications/:id/read` are also authenticated workspace routes.
- Admin routes include `/api/workspace/employees`, `/api/workspace/employees/options`, `/api/workspace/employees/:id` (activate/deactivate), `/api/workspace/reports`, task assignment/update, review, and rejected-task reopen.
- Employee task routes include `/api/workspace/tasks/:id/start`, `/api/workspace/tasks/:id/progress`, and `/api/workspace/tasks/:id/submit`.

## Production build

From the project root:

```powershell
npm.cmd run build
npm.cmd start
```

The frontend build is written to `frontend/dist`. The API listens on `PORT` (default `5000`).

## GitHub safety

Before pushing, inspect the files and staged changes. Do not stage `.env` files, generated output, or dependencies:

```powershell
git status --short --ignored
git add README.md .gitignore backend\.env.example backend\package.json backend\package-lock.json backend\src frontend\.env.example frontend\index.html frontend\src package.json
git diff --cached --stat
git diff --cached
```

Confirm no real Atlas URI, JWT secret, or other credentials appear in the staged diff. `.gitignore` ignores `.env` and `.env.*` files while allowing `.env.example`.

## Deployment

### Deploy both projects on Vercel

Create two Vercel projects from the existing GitHub repository; do not create a replacement repository:

1. **Frontend project:** set Root Directory to `frontend`, Framework Preset to Vite, build command to `npm run build`, and output directory to `dist`. Set Production `VITE_API_BASE_URL` to the backend's HTTPS origin only (no `/api` suffix).
2. **Backend project:** set Root Directory to `backend` and use the Express framework preset/automatic Express detection. Vercel's Express runtime supports the existing `src/server.js` Express entrypoint. The `backend/vercel.json` adds the deadline cron. Configure Production variables `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`, and `CRON_SECRET`; set `NODE_ENV=production` if the project does not provide it. Do not configure frontend secrets.
3. Set `FRONTEND_URL` to the exact production frontend origin, with no path or trailing slash. If preview deployments need API access, add only the exact preview origins that should be trusted.
4. In Atlas Network Access, allow the backend runtime's outbound access using the narrowest option supported by your Atlas/Vercel setup. Ensure the existing Atlas database user can access database `user`; do not change the URI database or the Task collection.
5. After deployment, verify `https://<backend-host>/api/health` reports `"database":"connected"` before testing authentication and workflows.

The backend uses database `user`, and the Task model uses collection `HR`; deployment does not require replacing, migrating, or deleting data. Set `MONGODB_URI` in the backend project's Vercel **Settings → Environment Variables → Production** to the existing Atlas connection string; never put it in frontend variables or source control. Set `JWT_SECRET` to a private random value of at least 32 characters and `CRON_SECRET` to a separate private random value. Enter both only through Vercel's environment-variable interface.

Authentication uses credentialed cross-origin cookies. The exact `FRONTEND_URL` allowlist enables the frontend origin; production cookies are `Secure`, `HttpOnly`, and `SameSite=None`. Some browser privacy settings block third-party cookies between separate `vercel.app` domains. If this affects sign-in, consider verified custom frontend/API subdomains under the same registrable domain.

#### Deadline reminder scheduling on Vercel Hobby

The persistent process interval is retained for local or persistent-server deployments, but it is not used on Vercel. Vercel Cron calls the protected `GET /api/internal/deadline-reminders` endpoint once daily at 00:00 UTC. The endpoint requires `Authorization: Bearer <CRON_SECRET>` and checks the existing actionable workflow statuses/current active assignee before creating an idempotent in-app notification. Hobby cron timing has up to 59 minutes of variance and only runs once per day; outages or execution after a task's deadline can also mean a reminder is late or missed. Therefore, the existing approximately 24-hour reminder requirement cannot be guaranteed on Hobby. No paid plan is assumed or required by this configuration.

## Troubleshooting

- **API unreachable:** confirm `VITE_API_BASE_URL` points to the backend origin, then check `/api/health` and the backend Vercel runtime logs.
- **CORS error:** set `FRONTEND_URL` to the exact browser origin (`scheme://host[:port]`) and restart/redeploy the backend.
- **Authentication fails after deployment:** confirm HTTPS, the frontend/API URLs, credentialed CORS, and browser cookie permissions. Prefer same-site custom domains if third-party cookies are blocked.
- **Backend exits at startup:** verify `MONGODB_URI` and `JWT_SECRET` are set in the backend environment. The backend requires a JWT secret of at least 32 characters.
- **MongoDB connection fails:** verify the Atlas user, URI, cluster status, and Atlas Network Access allowlist. Do not paste credentials into issue reports.
- **Legacy tasks are not listed:** ownerless records are intentionally inaccessible until an authorized administrator assigns specific records to a user.
- **Employee should be admin:** first create the account through signup, then run the explicit `promote-admin` command above with the correct email and `--confirm`.
