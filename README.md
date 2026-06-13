# FilingGrid

**Stateless, multi-column SEC filing and disclosure comparison workspace.**

FilingGrid streams 10-K and 10-Q filings from SEC EDGAR, parses them into standard disclosure sections entirely in RAM, and renders a synchronized side-by-side comparison workspace. Filing content is never written to disk or stored in the database — only account, billing, and preference metadata are persisted.

---

## Architecture

| Layer | Stack | Purpose |
|---|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS | Compare workspace, SEO, paywall UI |
| Backend | Python FastAPI | SEC parsing pipeline, auth gates, Stripe billing |
| Database | PostgreSQL + SQLAlchemy RLS | Users, orgs, subscriptions, peer groups |
| Auth | Supabase (magic link) | Passwordless corporate email sign-in |
| Billing | Stripe Checkout + Customer Portal | $29/mo Professional tier |

### Privacy model

- **Persisted:** email, organization, subscription tier, Stripe customer ID, saved ticker lists
- **Never persisted:** parsed filing HTML, footnote text, financial figures, session comparison data
- **No localStorage** for filing content (auth uses HTTP-only session cookies via Supabase)

---

## Prerequisites

Install on each machine you develop from:

- **Node.js 18+** and npm — [nodejs.org](https://nodejs.org/)
- **Python 3.11+** — [python.org](https://www.python.org/)
- **Docker Desktop** — for PostgreSQL ([docker.com](https://www.docker.com/))
- **Git** — [git-scm.com](https://git-scm.com/)
- **GitHub account** — for syncing between computers

External services (free tiers available):

- [Supabase](https://supabase.com/) project (Auth)
- [Stripe](https://stripe.com/) account (Billing)

---

## Quick start (first computer)

### Windows — one-click launch

Double-click **`start.bat`** in the project root (or run it from a terminal). It will:

1. Create `.env` from `.env.example` if missing
2. Start PostgreSQL via Docker (if Docker Desktop is installed)
3. Install Python and npm dependencies on first run
4. Open the API (`http://localhost:8000`) and web app (`http://localhost:3000`) in separate windows

To stop, close those windows or run **`stop.bat`**.

### Manual setup

### 1. Clone or initialize the repository

If this is a fresh setup and you haven't pushed to GitHub yet, skip to **Working across two computers** below.

```bash
git clone https://github.com/YOUR_USERNAME/filinggrid.git
cd filinggrid
```

### 2. Configure environment

```bash
copy .env.example .env          # Windows
# cp .env.example .env          # macOS / Linux
```

Edit `.env` with your credentials (see [Environment variables](#environment-variables)).

Also copy env to the backend (FastAPI reads from `backend/.env` or project root):

```bash
copy .env backend\.env          # Windows
# cp .env backend/.env          # macOS / Linux
```

### 3. Start PostgreSQL

```bash
docker compose up -d
```

### 4. Install and run the backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000

# macOS / Linux
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

API available at `http://localhost:8000` · Docs at `http://localhost:8000/docs`

### 5. Install and run the frontend

Open a **second terminal** in the project root:

```bash
npm install
npm run dev
```

App available at `http://localhost:3000`

---

## Working across two computers with GitHub

Use GitHub as the single source of truth so both machines always have the same project files.

### First-time setup (Computer A — this machine)

#### Step 1: Create a GitHub repository

1. Go to [github.com/new](https://github.com/new)
2. Name it `filinggrid` (or your preferred name)
3. Leave it **empty** — do not add a README, `.gitignore`, or license (this project already has them)
4. Click **Create repository**

#### Step 2: Initialize Git and push from Computer A

Open a terminal in the project folder:

```bash
cd "C:\Users\davel\TECH\Reporting - Comparative Viewer"   # adjust path

git init
git add .
git commit -m "Initial FilingGrid implementation"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/filinggrid.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

> **Important:** Never commit `.env` files. They are listed in `.gitignore`. Each computer needs its own local `.env` copied from `.env.example`.

#### Step 3: Authenticate with GitHub

When prompted for credentials:

- **HTTPS:** Use a [Personal Access Token](https://github.com/settings/tokens) as your password (not your GitHub account password)
- **SSH (recommended for daily use):**
  ```bash
  ssh-keygen -t ed25519 -C "your-email@company.com"
  # Add the public key (~/.ssh/id_ed25519.pub) at github.com/settings/keys
  git remote set-url origin git@github.com:YOUR_USERNAME/filinggrid.git
  ```

---

### Setting up Computer B (second machine)

#### Step 1: Install prerequisites

Install Node.js, Python, Docker, and Git (same versions as Computer A).

#### Step 2: Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/filinggrid.git
cd filinggrid
```

Or with SSH:

```bash
git clone git@github.com:YOUR_USERNAME/filinggrid.git
cd filinggrid
```

#### Step 3: Create local environment files

`.env` is **not** in GitHub (by design). Create it on Computer B:

```bash
copy .env.example .env          # Windows
cp .env.example .env            # macOS / Linux

copy .env backend\.env          # Windows
cp .env backend/.env            # macOS / Linux
```

Fill in the same Supabase and Stripe keys (or separate test keys per machine).

#### Step 4: Install dependencies and run

```bash
docker compose up -d

cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Second terminal (project root):

```bash
npm install
npm run dev
```

---

### Daily workflow — keeping both computers in sync

#### Before starting work (pull latest changes)

Always pull before you begin, especially if you worked on the other computer recently:

```bash
git pull origin main
npm install          # if package.json changed
cd backend
pip install -r requirements.txt   # if requirements changed
```

#### After finishing work (push your changes)

```bash
git status                        # review what changed
git add .
git commit -m "Describe your change"
git push origin main
```

#### Recommended branch workflow (optional, for larger changes)

```bash
git checkout -b feature/my-change
# ... make changes ...
git add .
git commit -m "Add my feature"
git push -u origin feature/my-change
# Open a Pull Request on GitHub, then merge to main
git checkout main
git pull origin main
```

#### Handling merge conflicts

If both computers edited the same file:

```bash
git pull origin main
# Git will mark conflicts in affected files
# Edit files to resolve, then:
git add .
git commit -m "Resolve merge conflict"
git push origin main
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Frontend URL (`http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` | Backend URL (`http://localhost:8000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret (Settings → API) |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_PRICE_PROFESSIONAL` | Stripe Price ID for $29/mo plan |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `DATABASE_URL` | PostgreSQL connection string |
| `SEC_USER_AGENT` | **Required by SEC** — include your contact email |
| `APP_URL` | Used in Stripe redirect URLs |
| `CORS_ORIGINS` | Allowed frontend origin |

---

## Stripe setup

### 1. Create a product and price

In [Stripe Dashboard → Products](https://dashboard.stripe.com/products):

1. Create product: **FilingGrid Professional**
2. Add recurring price: **$29/month**
3. Copy the **Price ID** (`price_...`) → `STRIPE_PRICE_PROFESSIONAL`

### 2. Configure webhooks

For local development, use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe login
stripe listen --forward-to localhost:8000/webhooks/stripe
```

Copy the webhook signing secret → `STRIPE_WEBHOOK_SECRET`

For production, add endpoint `https://yourdomain.com/webhooks/stripe` listening to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

### 3. Enable Customer Portal

Stripe Dashboard → Settings → Billing → Customer portal → Enable.

---

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com/)
2. Authentication → Providers → Email → Enable **Magic Link**
3. Authentication → URL Configuration:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`
4. Copy Project URL, anon key, and JWT secret to `.env`

---

## Subscription tiers

| Feature | Free | Professional ($29/mo) |
|---|---|---|
| Ticker columns | 3 max | 8 max |
| Filing years | Current year only | All available |
| Login required | No | Yes (corporate email) |
| Saved peer groups | No | Yes |
| Billing | — | Stripe Checkout + Portal |

Paywall triggers automatically on the 4th ticker or a historical year request.

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/parse` | Parse tickers into filing sections (in-memory) |
| GET | `/auth/me` | Current user tier and limits |
| GET | `/tickers/search?q=` | Ticker autocomplete |
| POST | `/billing/checkout` | Create Stripe Checkout session |
| POST | `/billing/portal` | Create Stripe Customer Portal session |
| GET | `/billing/status` | Subscription status |
| POST | `/webhooks/stripe` | Stripe webhook handler |
| GET/POST | `/peer-groups` | Saved peer groups (Professional) |

---

## Compare workspace routes

| URL | Example |
|---|---|
| Home | `/` |
| Compare | `/compare/aapl-vs-msft-vs-nvda` |
| Historical | `/compare/aapl-vs-msft?year=2022` |
| Pricing | `/pricing` |

Section navigation in the left sidebar broadcasts a synchronized scroll event to all open ticker columns simultaneously.

---

## Project structure

```
filinggrid/
├── app/                          # Next.js App Router
│   ├── compare/[peer_slug]/      # Multi-pane compare workspace
│   ├── auth/callback/            # Supabase magic link handler
│   ├── pricing/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── compare/                  # CompareGrid, FilingColumn, SectionNav
│   ├── billing/                  # PaywallModal
│   └── TickerSearchBar.tsx
├── lib/                          # API client, Supabase, utilities
├── backend/
│   ├── main.py                   # FastAPI entry point
│   ├── database.py               # SQLAlchemy schema + RLS
│   ├── parser.py                 # Stateless SEC parsing pipeline
│   ├── middleware.py             # JWT + tier gates
│   ├── billing/stripe_routes.py  # Checkout, Portal, webhooks
│   └── sec/                      # EDGAR client + section extractor
├── docker-compose.yml            # PostgreSQL
├── .env.example
└── README.md
```

---

## Production deployment notes

- Set `NEXT_PUBLIC_APP_URL` and `APP_URL` to your production domain
- Use a managed PostgreSQL instance (Supabase DB, RDS, etc.)
- Run backend with `uvicorn main:app --host 0.0.0.0 --port 8000` behind a reverse proxy
- Deploy frontend to Vercel or similar
- Register production Stripe webhook endpoint
- Update Supabase redirect URLs for production domain
- Set a real `SEC_USER_AGENT` with your company contact email

---

## License

Proprietary — All rights reserved.
