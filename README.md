<div align="center">

# ✈️ TripMate AI

### A multi-agent travel planner built on LangGraph with live flight data and persistent memory

*Type "Plan a 3-day trip from Dhaka to Tokyo on a $1200 budget" and four agents research it together.<br/>
You get live flights, hotel picks and a day-by-day itinerary.*

<br/>

![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1.2-1C3C3C)
![LangSmith](https://img.shields.io/badge/LangSmith-tracing-F97316)
![Groq](https://img.shields.io/badge/Groq-compound--mini-F55036)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-checkpointer-4169E1?logo=postgresql&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)
![Tavily](https://img.shields.io/badge/Tavily-web%20search-0EA5E9)
![AviationStack](https://img.shields.io/badge/AviationStack-live%20flights-111827)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

</div>

---

## 💡 What it does

TripMate AI turns a natural-language trip request into a structured plan by passing it through a **LangGraph pipeline of four specialised agents**. They share one typed state, and every conversation is stored in **PostgreSQL**, so you can come back to it later.

> 🔀 **One repo, three versions.** Each version of TripMate AI lives on its own branch of [`TripMate-AI`](https://github.com/nishantrv/TripMate-AI):
>
> | Branch | Version | What it adds |
> |---|---|---|
> | [`v1-langgraph`](https://github.com/nishantrv/TripMate-AI/tree/v1-langgraph) | v1 (this branch) | 4 LangGraph agents with hand-written Python tools |
> | [`v2-mcp`](https://github.com/nishantrv/TripMate-AI/tree/v2-mcp) | v2 | Tools moved to 3 MCP servers, plus a weather agent |
> | [`v3-supervisor-hitl`](https://github.com/nishantrv/TripMate-AI/tree/v3-supervisor-hitl) | v3 | Supervisor routing, input guardrail, budget agent and human approval |

---

## 🧭 Architecture

```mermaid
flowchart LR
    U([👤 Traveller]) --> API[FastAPI<br/>POST /api/travel]
    API --> G
    subgraph G[LangGraph StateGraph · PostgresSaver]
        direction LR
        F[✈️ Flight agent] --> H[🏨 Hotel agent] --> I[🗺️ Itinerary agent] --> Z[📝 Final agent]
    end
    F -.-> FT[[flight_tool.py<br/>NL → IATA route → AviationStack]]
    H -.-> TT[[tavily_tool.py<br/>top-5 web results]]
    Z --> API --> U
```

| Agent | Job |
|---|---|
| ✈️ **Flight** | Turns the request into a route and fetches **live flights** from AviationStack |
| 🏨 **Hotel** | Searches the web with Tavily for hotels that match the trip |
| 🗺️ **Itinerary** | Combines flights and hotels into a practical, budget-aware day-by-day plan |
| 📝 **Final** | Formats everything into one clear answer |

The agents share a `TravelState` (`TypedDict`) that holds the message history, each agent's results, and an **`llm_calls` counter** for cost visibility. Tool output is **truncated to 1,500 characters** before it reaches the LLM, which keeps prompts small and cheap.

---

## 🛫 The flight tool

`tools/flight_tool.py` works out a route from free text before calling any API:

- It resolves **countries, cities, airport names or raw IATA codes** to airports, using `airportsdata` and `pycountry` plus an alias table ("UK" → GB, "UAE" → AE…).
- Each country maps to its main hub (Japan → NRT, India → DEL, Germany → FRA…).
- `parse_route()` handles **"from X to Y"**, departure-only, arrival-only and "all countries" queries, and returns `(dep_iata, arr_iata)`.
- Errors are handled cleanly: missing keys, API errors and empty results. It also states plainly that AviationStack gives **flight status, not fares**.

---

## 📈 Observability with LangSmith

LangGraph and LangChain send traces to **LangSmith** automatically when tracing is enabled through environment variables. Each agent node, LLM call and token count appears as a span, with no extra code:

```ini
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=tripmate-ai
```

---

## 🚀 Quickstart

```bash
git clone -b v1-langgraph https://github.com/nishantrv/TripMate-AI.git
cd TripMate-AI
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

`.env`:

```ini
GROQ_API_KEY=...
TAVILY_API_KEY=...
AVIATIONSTACK_API_KEY=...
DATABASE_URL=postgresql://user:password@host:5432/travel_db
DEFAULT_ORIGIN_IATA=DUB          # used when no origin is mentioned
```

```bash
python app.py        # → http://127.0.0.1:8000
```

Docker:

```bash
docker build -t tripmate .
docker run --env-file .env -p 8000:8000 tripmate
```

### API

```bash
curl -X POST http://127.0.0.1:8000/api/travel \
  -H "Content-Type: application/json" \
  -d '{"message":"Plan a 3-day trip from Dhaka to Tokyo with a budget of $1200"}'
```

The response contains `answer`, `flight_results`, `hotel_results`, `itinerary`, `llm_calls` and a `thread_id`. Send the `thread_id` back to continue the same conversation.

---

## 🗂️ Project layout

```
app.py               FastAPI app, UI + /api/travel + /health
backend.py           LangGraph state, four agents, PostgresSaver
tools/flight_tool.py Natural-language route parsing + AviationStack client
tools/tavily_tool.py Tavily search, formatted top-5 results
templates/ static/   Web UI
Dockerfile
```

---

## 🧰 Tech stack

**LangGraph** · **LangChain** · **LangSmith** · **Groq** · **PostgreSQL** (`langgraph-checkpoint-postgres`, `psycopg`) · **FastAPI** · **Jinja2** · **Tavily** · **AviationStack** · **airportsdata** · **pycountry** · **Docker**

---

<div align="center">

Built by **[Nishant](https://github.com/nishantrv)**. If this was useful, a ⭐ is appreciated.

</div>
