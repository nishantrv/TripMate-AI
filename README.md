<div align="center">

# ✈️ TripMate AI: Supervisor + Guardrails + Human-in-the-Loop

### A multi-agent travel planner where a supervisor decides which agents run, a guardrail screens every request, and you approve the plan before it's final

*Describe a trip in one sentence. The supervisor picks the agents it needs, they research flights, hotels, weather and budget over MCP,<br/>
and the draft itinerary waits for your approval or feedback before the final plan is written.*

<br/>

![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1.2-1C3C3C)
![Supervisor](https://img.shields.io/badge/Supervisor-routing-6C63FF)
![Guardrail](https://img.shields.io/badge/Input-guardrail-EF4444)
![HITL](https://img.shields.io/badge/Human--in--the--loop-interrupt-F59E0B)
![MCP](https://img.shields.io/badge/MCP-3%20servers-7C3AED)
![Groq](https://img.shields.io/badge/Groq-gpt--oss--120b-F55036)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-checkpointer-4169E1?logo=postgresql&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)

</div>

---

## 💡 What's new in v3

v2 ran every agent on every request, and its answer went straight to the user. v3 adds three controls around the same MCP-powered agents:

- **A supervisor agent** reads the request and runs only the specialists it needs. Asking about weather doesn't trigger a flight search.
- **An input guardrail** blocks requests that aren't about travel, or that ask for harmful instructions, before any tool or API is called.
- **A human approval step.** The graph pauses on a draft itinerary. You approve it or send feedback, and only then is the final plan written.

There's also a new **budget agent** that checks whether the trip fits the stated budget.

> 🔀 **One repo, three versions.** Each version of TripMate AI lives on its own branch:
>
> | Branch | Version | What it adds |
> |---|---|---|
> | [`v1-langgraph`](https://github.com/nishantrv/TripMate-AI/tree/v1-langgraph) | v1 | 4 LangGraph agents with hand-written Python tools |
> | [`v2-mcp`](https://github.com/nishantrv/TripMate-AI/tree/v2-mcp) | v2 | Tools moved to 3 MCP servers, plus a weather agent |
> | [`v3-supervisor-hitl`](https://github.com/nishantrv/TripMate-AI/tree/v3-supervisor-hitl) | v3 (this branch) | Supervisor routing, input guardrail, budget agent and human approval |

---

## 🧭 Architecture

```mermaid
flowchart TD
    U([👤 Traveller]) -->|POST /api/travel| S

    subgraph G[LangGraph StateGraph · PostgresSaver checkpointer]
        S{🧑‍✈️ Supervisor<br/>guardrail + routing}
        S -->|blocked| B[⛔ Guardrail response]
        S -->|selected agents only| F[✈️ Flight]
        F --> H[🏨 Hotel] --> W[🌦️ Weather] --> BU[💰 Budget] --> I[🗺️ Itinerary draft]
        I --> HA[[👤 Human approval<br/>interrupt]]
        HA --> FI[📝 Final agent]
    end

    HA -. pauses, returns draft .-> U
    U -->|POST /api/travel/approve| HA
    B --> U
    FI --> U

    F -. MCP .-> AV[(AviationStack<br/>stdio · uvx)]
    H -. MCP .-> TV[(Tavily<br/>remote HTTP)]
    W -. MCP .-> WX[(Custom weather<br/>FastMCP · OpenWeather)]
```

The supervisor can skip any of flight, hotel, weather or budget. Skipped agents are jumped over in that fixed order. The itinerary agent always runs, because it combines whatever the others found.

| Agent | What it does |
|---|---|
| 🧑‍✈️ **Supervisor** | Runs the input guardrail, then picks the agents to run and pulls out trip constraints (origin, destination, duration, budget, travel style, preferences) |
| ⛔ **Guardrail response** | Returns a polite refusal for blocked requests and ends the run |
| ✈️ **Flight** | Pulls airports and airlines from the AviationStack MCP server and asks the LLM for likely routes, carriers, duration, fare range and booking advice |
| 🏨 **Hotel** | Runs a Tavily web search over MCP for accommodation that matches the request |
| 🌦️ **Weather** | Extracts the destination and calls the custom weather MCP server for current conditions and a forecast |
| 💰 **Budget** | Estimates the cost categories, flags budget risks and suggests savings. Estimates are labelled as approximate when live prices aren't available |
| 🗺️ **Itinerary** | Combines the selected agents' results into a draft plan for review |
| 👤 **Human approval** | Pauses the graph with `interrupt()` until the traveller approves or sends feedback |
| 📝 **Final** | Writes the finished plan in seven sections, applying the feedback if a revision was requested |

---

## 🛡️ How the controls behave

**Guardrail.** One LLM call returns `{"allowed": bool, "reason": str}`. Travel questions about destinations, flights, hotels, weather, budgets, visas, transport, food, packing or itineraries are allowed, even if details are missing. Off-topic or harmful requests are blocked, and the reason is shown to the user.

**Supervisor routing.** A second LLM call returns the selected agents and the trip constraints as JSON. Unknown agent names are dropped, and the itinerary agent is always added.

**Fallbacks.** If either call returns something that can't be parsed, the app doesn't fail the request. The guardrail **fails open** (the request is allowed) and the supervisor falls back to running **every** agent, so you get v2's behaviour.

**Human approval.** The draft is saved in the Postgres checkpointer under its `thread_id`, so the pause survives a server restart. Approving keeps the draft's decisions and polishes it. Rejecting requires feedback, which the final agent applies.

---

## 🔌 MCP servers

| Server | Transport | How it runs |
|---|---|---|
| **Tavily** | `streamable_http` | Hosted remote MCP at `mcp.tavily.com` |
| **AviationStack** | `stdio` | Third-party package launched on demand with `uvx aviationstack-mcp` |
| **Weather** | `stdio` | Built for this project. `custom_weather_mcp_server.py` is a `FastMCP` server that wraps OpenWeather, started with the app's own Python interpreter |

Each agent catches its own MCP errors. If one server is down, that agent returns clearly labelled general guidance and the rest of the plan still gets made.

---

## 🚀 Quickstart

```bash
git clone -b v3-supervisor-hitl https://github.com/nishantrv/TripMate-AI.git
cd TripMate-AI
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install uv                                         # provides `uvx` for the AviationStack MCP server
```

Create a `.env` file:

```ini
GROQ_API_KEY=...
TAVILY_API_KEY=...
AVIATIONSTACK_API_KEY=...          # AVIATION_STACK_API_KEY also works
OPENWEATHER_API_KEY=...
DATABASE_URL=postgresql://user:password@host:5432/travel_db
```

```bash
python app.py                 # → http://127.0.0.1:8000
python test.py                # check which MCP servers connect and list their tools
```

In the web UI, **Generate Draft** shows the supervisor's plan and the draft itinerary. Then use **Approve & Generate Final**, or type feedback and use **Revise Using Feedback**.

### API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/` | Web UI |
| `POST` | `/api/travel` | `{"message": "...", "thread_id": "optional"}`. Runs until the approval step and returns the draft, `requires_approval`, the supervisor's plan and the `thread_id` |
| `POST` | `/api/travel/approve` | `{"thread_id": "...", "approved": true, "feedback": ""}`. Resumes the paused thread and returns the final plan. Feedback is required when `approved` is `false` |
| `GET` | `/health` | Liveness check |

```bash
# 1. Get a draft
curl -X POST http://127.0.0.1:8000/api/travel \
  -H "Content-Type: application/json" \
  -d '{"message":"Plan a 4-day trip from Dublin to Tokyo in October on a $2000 budget"}'

# 2. Approve it (use the thread_id from step 1)
curl -X POST http://127.0.0.1:8000/api/travel/approve \
  -H "Content-Type: application/json" \
  -d '{"thread_id":"user_...","approved":true,"feedback":""}'
```

---

## 🗂️ Project layout

```
app.py                        FastAPI app: UI, /api/travel, /api/travel/approve
backend.py                    LangGraph state, supervisor + guardrail, 7 agents, approval interrupt, Postgres checkpointer
mcp_client.py                 MultiServerMCPClient: Tavily · AviationStack · Weather
custom_weather_mcp_server.py  FastMCP server wrapping OpenWeather
templates/ · static/          Web UI with the execution plan and approval panel
test.py                       MCP connectivity check
Dockerfile
```

---

## 🧰 Tech stack

**LangGraph** (`interrupt`, `Command`, conditional routing) · **LangChain** · **langchain-mcp-adapters** · **MCP / FastMCP** · **Groq** (`openai/gpt-oss-120b`) · **PostgreSQL** (`langgraph-checkpoint-postgres`) · **FastAPI** · **Jinja2** · **Tavily** · **AviationStack** · **OpenWeather** · **Docker**

---

<div align="center">

Built by **[Nishant](https://github.com/nishantrv)**. If this was useful, a ⭐ is appreciated.

</div>
