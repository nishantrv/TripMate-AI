// Each "Generate Draft" starts a new LangGraph thread. The thread pauses at
// the human approval step and is resumed through /api/travel/approve.
let currentThreadId = null;
let latestAnswerMarkdown = "";

const AGENT_LABELS = {
    flight_agent: "✈️ Flight",
    hotel_agent: "🏨 Hotel",
    weather_agent: "🌦️ Weather",
    budget_agent: "💰 Budget",
    itinerary_agent: "🗺️ Itinerary"
};

function setPrompt(text) {
    document.getElementById("userInput").value = text;
}

function setLoading(isLoading) {
    const sendBtn = document.getElementById("sendBtn");
    const btnText = document.getElementById("btnText");
    const btnLoader = document.getElementById("btnLoader");

    sendBtn.disabled = isLoading;

    if (isLoading) {
        btnText.classList.add("hidden");
        btnLoader.classList.remove("hidden");
    } else {
        btnText.classList.remove("hidden");
        btnLoader.classList.add("hidden");
    }
}

function setApprovalLoading(isLoading, approved) {
    const approveBtn = document.getElementById("approveBtn");
    const reviseBtn = document.getElementById("reviseBtn");

    approveBtn.disabled = isLoading;
    reviseBtn.disabled = isLoading;

    if (isLoading) {
        const activeBtn = approved ? approveBtn : reviseBtn;
        activeBtn.dataset.label = activeBtn.textContent;
        activeBtn.textContent = approved ? "Generating final plan..." : "Revising plan...";
    } else {
        [approveBtn, reviseBtn].forEach((btn) => {
            if (btn.dataset.label) {
                btn.textContent = btn.dataset.label;
                delete btn.dataset.label;
            }
        });
    }
}

function showError(message) {
    const errorBox = document.getElementById("errorBox");

    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
}

function hideError() {
    const errorBox = document.getElementById("errorBox");

    errorBox.classList.add("hidden");
    errorBox.textContent = "";
}

function showResult(answer, threadId, title) {
    latestAnswerMarkdown = answer;

    const resultSection = document.getElementById("resultSection");
    const resultBox = document.getElementById("resultBox");
    const threadInfo = document.getElementById("threadInfo");
    const resultTitle = document.getElementById("resultTitle");

    if (typeof marked !== "undefined") {
        resultBox.innerHTML = marked.parse(answer);
    } else {
        resultBox.innerText = answer;
    }

    resultTitle.textContent = title;
    threadInfo.textContent = `Thread ID: ${threadId}`;

    resultSection.classList.remove("hidden");

    resultSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function renderWorkflow(data) {
    const workflowSection = document.getElementById("workflowSection");
    const guardrailBadge = document.getElementById("guardrailBadge");
    const supervisorReasoning = document.getElementById("supervisorReasoning");
    const agentChips = document.getElementById("agentChips");

    const allowed = data.guardrail_allowed !== false;

    guardrailBadge.textContent = allowed ? "Guardrail passed" : "Blocked by guardrail";
    guardrailBadge.classList.toggle("blocked", !allowed);

    supervisorReasoning.textContent = allowed
        ? (data.supervisor_reasoning || "")
        : (data.guardrail_reason || data.answer || "");

    agentChips.replaceChildren();
    (data.selected_agents || []).forEach((agent) => {
        const chip = document.createElement("span");
        chip.className = "agent-chip";
        chip.textContent = AGENT_LABELS[agent] || agent;
        agentChips.appendChild(chip);
    });

    workflowSection.classList.remove("hidden");
}

function showApproval(approvalRequest) {
    const approvalSection = document.getElementById("approvalSection");
    const approvalText = document.getElementById("approvalRequest");

    if (approvalRequest) {
        approvalText.textContent = approvalRequest;
    }

    document.getElementById("approvalFeedback").value = "";
    approvalSection.classList.remove("hidden");
}

function hideApproval() {
    document.getElementById("approvalSection").classList.add("hidden");
}

async function postJson(url, payload) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
        throw new Error(data.error || "Something went wrong.");
    }

    return data;
}

async function sendMessage() {
    hideError();

    const input = document.getElementById("userInput");
    const message = input.value.trim();

    if (!message) {
        showError("Please enter your travel request first.");
        return;
    }

    setLoading(true);
    hideApproval();

    try {
        // A new trip always starts a new thread. Reusing a thread that is
        // paused at the approval step would mix two trips together.
        const data = await postJson("/api/travel", {
            message: message,
            thread_id: null
        });

        currentThreadId = data.thread_id;
        renderWorkflow(data);

        if (data.requires_approval) {
            showResult(data.answer, data.thread_id, "Draft Itinerary (awaiting your review)");
            showApproval(data.approval_request);
        } else {
            const title = data.guardrail_allowed === false
                ? "Request not supported"
                : "Your AI Travel Plan";
            showResult(data.answer, data.thread_id, title);
        }

    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(false);
    }
}

async function submitApproval(approved) {
    hideError();

    if (!currentThreadId) {
        showError("There is no draft to review. Generate a draft first.");
        return;
    }

    const feedback = document.getElementById("approvalFeedback").value.trim();

    if (!approved && !feedback) {
        showError("Please add feedback describing what to change before requesting a revision.");
        return;
    }

    setApprovalLoading(true, approved);

    try {
        const data = await postJson("/api/travel/approve", {
            thread_id: currentThreadId,
            approved: approved,
            feedback: feedback
        });

        hideApproval();
        showResult(
            data.answer,
            data.thread_id,
            approved ? "Your AI Travel Plan" : "Your Revised Travel Plan"
        );

    } catch (error) {
        showError(error.message);
    } finally {
        setApprovalLoading(false, approved);
    }
}

function copyResult() {
    const resultBox = document.getElementById("resultBox");
    const text = resultBox.innerText;

    if (!text) {
        return;
    }

    navigator.clipboard.writeText(text)
        .then(() => {
            const copyBtn = document.querySelector(".copy-btn");
            const oldText = copyBtn.textContent;

            copyBtn.textContent = "Copied!";

            setTimeout(() => {
                copyBtn.textContent = oldText;
            }, 1400);
        })
        .catch(() => {
            showError("Could not copy result.");
        });
}

function downloadPDF() {
    const pdfContent = document.getElementById("pdfContent");

    if (!latestAnswerMarkdown || !pdfContent) {
        showError("No travel plan available to download.");
        return;
    }

    const downloadBtn = document.querySelector(".download-btn");
    const oldText = downloadBtn.textContent;

    downloadBtn.textContent = "Preparing PDF...";
    downloadBtn.disabled = true;

    const options = {
        margin: 0.5,
        filename: "ai-travel-plan.pdf",
        image: {
            type: "jpeg",
            quality: 0.98
        },
        html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff"
        },
        jsPDF: {
            unit: "in",
            format: "a4",
            orientation: "portrait"
        },
        pagebreak: {
            mode: ["avoid-all", "css", "legacy"]
        }
    };

    html2pdf()
        .set(options)
        .from(pdfContent)
        .save()
        .then(() => {
            downloadBtn.textContent = oldText;
            downloadBtn.disabled = false;
        })
        .catch(() => {
            downloadBtn.textContent = oldText;
            downloadBtn.disabled = false;
            showError("Could not download PDF.");
        });
}

document.addEventListener("keydown", function(event) {
    if (event.ctrlKey && event.key === "Enter") {
        sendMessage();
    }
});
