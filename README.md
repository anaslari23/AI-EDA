<p align="center">
  <strong>⚡ AI EDA — AI-Native Electronic Design Automation</strong>
</p>

<p align="center">
  Describe your hardware in plain English. Get a validated circuit design in seconds.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.12-blue?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PixiJS-8-E91E63?logo=data:image/svg+xml;base64," alt="PixiJS" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker" alt="Docker" />
</p>

---

## 🧠 What is AI EDA?

**AI EDA** is an AI-native Electronic Design Automation platform that transforms natural language hardware descriptions into fully validated circuit schematics. Instead of manually selecting components and wiring them together, you simply describe what you want to build — and the AI pipeline handles the rest.

### Example

> *"I need a weather station with temperature and humidity sensors, WiFi connectivity, battery powered, for outdoor use"*

The platform will:
1. **Parse your intent** — extract sensors, connectivity, power requirements, and constraints
2. **Select real components** — match against an approved component database with voltage compatibility checks
3. **Generate a circuit graph** — create proper power rails, signal connections, and ground networks
4. **Validate the design** — run 6 electrical checks (voltage, grounding, dropout, decoupling, pull-ups, overcurrent)
5. **Render an interactive schematic** — display the circuit on a WebGL-powered canvas

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                           │
│  React 19 · TypeScript · Vite · PixiJS · Zustand        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ DesignInput  │→ │PipelineOutput│  │SchematicCanvas│  │
│  │  (NL prompt) │  │ (results/BOM)│  │ (WebGL render)│  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────┐
│                      Backend                            │
│  FastAPI · Pydantic v2 · SQLAlchemy · PostgreSQL        │
│                                                         │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────┐ │
│  │ Engine 1  │→ │ Engine 2   │→ │ Engine 3  │→ │Engine 4│ │
│  │ Intent    │  │ Component  │  │ Circuit   │  │Validate│ │
│  │ Parser    │  │ Selector   │  │ Generator │  │ Engine │ │
│  └──────────┘  └───────────┘  └──────────┘  └────────┘ │
│                                                         │
│  Services: BOM Generator · PCB Estimator · Correction   │
│  Infra: PostgreSQL 16 · Redis 7 · Docker Compose        │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- **Docker** & **Docker Compose** (recommended)
- Or: Python 3.12+ and Node.js 20+

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/anaslari23/AI-EDA.git
cd AI-EDA

# Copy environment template
cp .env.template .env

# Start all services
docker compose up --build
```

| Service   | URL                          |
|-----------|------------------------------|
| Frontend  | http://localhost:5173         |
| Backend   | http://localhost:8000         |
| API Docs  | http://localhost:8000/docs    |
| ReDoc     | http://localhost:8000/redoc   |

### Manual Setup

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## 🔧 AI Pipeline Engines

### Engine 1 — Intent Parser
Extracts structured hardware requirements from natural language using keyword-based NLP. Detects sensors, actuators, connectivity, power sources, communication protocols, environmental constraints, and device type.

### Engine 2 — Component Selector
Matches parsed intent against an **approved component database** (`data/approved_components.json`). Scores MCUs by connectivity/interface compatibility, selects voltage-compatible sensors, chooses regulators (optimized for battery or mains), and auto-generates required passives (decoupling caps, I2C pull-ups) and protection circuits.

### Engine 3 — Circuit Generator
Builds a complete circuit graph with:
- Power rails and ground networks
- MCU ↔ sensor signal connections (I2C, SPI, analog, GPIO)
- Voltage regulator wiring
- Decoupling capacitor placement
- Reverse polarity protection

### Engine 4 — Validation Engine
Runs **6 electrical validation checks**:
| Check | Description |
|---|---|
| Voltage Compatibility | Ensures all nodes receive compatible voltage |
| Ground Continuity | Verifies every IC has a ground connection |
| Regulator Dropout | Validates input voltage satisfies dropout requirements |
| Decoupling Capacitors | Checks every IC has proper decoupling |
| I2C Pull-ups | Ensures pull-up resistors on I2C buses |
| GPIO Overcurrent | Flags actuators connected directly to GPIO pins |

### Correction Engine
Provides automated fix suggestions with specific component recommendations for validation failures.

---

## 📁 Project Structure

```
AI-EDA/
├── backend/
│   ├── app/
│   │   ├── ai/                    # AI engines
│   │   │   ├── intent_parser.py   # Engine 1: NL → structured intent
│   │   │   ├── component_selector.py  # Engine 2: intent → components
│   │   │   └── circuit_generator.py   # Engine 3: components → circuit graph
│   │   ├── validation/
│   │   │   ├── engine.py          # Engine 4: circuit validation
│   │   │   └── correction.py      # Auto-fix suggestions
│   │   ├── schemas/               # Pydantic v2 models
│   │   │   ├── intent.py          # HardwareIntent, DeviceConstraints
│   │   │   ├── component.py       # MCU, Sensor, Regulator, Passive
│   │   │   ├── circuit.py         # CircuitGraph, CircuitNode, CircuitEdge
│   │   │   ├── validation.py      # ValidationResult, ValidationError
│   │   │   ├── bom.py             # Bill of Materials
│   │   │   └── pcb.py             # PCB estimation
│   │   ├── routers/               # API endpoints
│   │   │   ├── pipeline.py        # /api/pipeline — full design pipeline
│   │   │   ├── components.py      # /api/components — component queries
│   │   │   └── design.py          # /api/design — design management
│   │   ├── services/              # Business logic
│   │   │   ├── bom/               # BOM generation
│   │   │   └── pcb/               # PCB cost/area estimation
│   │   ├── models/                # SQLAlchemy ORM models
│   │   ├── db/                    # Database configuration
│   │   ├── config.py              # App settings
│   │   └── main.py                # FastAPI app factory
│   ├── data/
│   │   └── approved_components.json  # Component database
│   ├── tests/                     # Pytest test suite
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/                   # API client (fetch wrapper)
│   │   ├── canvas/                # PixiJS schematic renderer
│   │   │   └── SchematicCanvas.tsx
│   │   ├── components/            # React UI components
│   │   │   ├── DesignInput.tsx    # Natural language input form
│   │   │   └── PipelineOutput.tsx # Results display
│   │   ├── store/                 # Zustand state management
│   │   ├── types/                 # TypeScript type definitions
│   │   ├── styles/                # CSS stylesheets
│   │   ├── App.tsx                # Root application component
│   │   └── main.tsx               # Entry point
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml             # Full stack orchestration
├── .env.template                  # Environment variable template
└── README.md
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript 5.9, Vite 7, PixiJS 8, Zustand 5 |
| **Backend** | Python 3.12, FastAPI 0.115, Pydantic v2, SQLAlchemy 2.0 |
| **Database** | PostgreSQL 16 (Alpine) |
| **Cache** | Redis 7 (Alpine) |
| **Infrastructure** | Docker Compose, multi-container orchestration |
| **Testing** | Pytest, pytest-asyncio |

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/pipeline/run` | Run the full AI design pipeline |
| `GET` | `/api/components/` | List approved components |
| `GET` | `/api/components/search` | Search component database |
| `POST` | `/api/design/save` | Save a design |
| `GET` | `/health` | Service health check |

Full interactive API documentation available at [`/docs`](http://localhost:8000/docs) (Swagger) and [`/redoc`](http://localhost:8000/redoc).

---

## 🧪 Running Tests

```bash
cd backend
pytest tests/ -v
```

---

## 📄 Environment Variables

Copy `.env.template` to `.env` and configure:

| Variable | Default | Description |
|---|---|---|
| `BACKEND_PORT` | `8000` | Backend API port |
| `VITE_API_URL` | `http://localhost:8000` | Frontend → Backend URL |
| `POSTGRES_USER` | `ai_eda` | Database username |
| `POSTGRES_PASSWORD` | `changeme` | Database password |
| `POSTGRES_DB` | `ai_eda` | Database name |
| `REDIS_HOST` | `cache` | Redis hostname |
| `ENV` | `development` | Environment mode |

---

## 🗺️ Roadmap

- [ ] LLM-powered intent parsing (GPT/Claude integration)
- [ ] Real-time collaborative editing
- [ ] PCB layout auto-routing
- [ ] Component procurement integration (Mouser/DigiKey API)
- [ ] SPICE simulation integration
- [ ] Export to KiCad / Altium formats
- [ ] User authentication & project management

---

## 📜 License

This project is open source. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ⚡ by <a href="https://github.com/anaslari23">anaslari23</a>
</p>
