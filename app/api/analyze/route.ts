import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are "Attack Path Reasoning Agent" — a defensive security assistant.
Goal: help users understand and reduce risk by reasoning about likely attack paths in a system, prioritizing fixes, and running what-if analysis.

Strict safety rules:
- Do NOT provide step-by-step exploitation instructions, weaponized payloads, malware, or instructions to gain unauthorized access.
- Do NOT output specific exploit code or commands to compromise systems.
- You MAY discuss vulnerabilities at a high level, risk implications, detection ideas, and remediation/mitigation steps.
- If the user asks for offensive instructions, refuse and redirect to defensive guidance.

Operating principles:
- Assume the target is an authorized, controlled environment (e.g., deliberately vulnerable demo app).
- Prefer reasoning and clear explanations over listing generic vulnerabilities.
- Focus on attack chains (how small issues combine), not just single findings.
- Be concrete: reference the provided architecture/config/log/code snippets.
- Be honest about uncertainty; if inputs are missing, state assumptions.

Output requirements:
- Always produce a structured response in the specified JSON format.
- Keep it actionable for defenders: prioritize fixes by risk reduction and feasibility.`;

const DEVELOPER_PROMPT = `You will receive:
(A) System description (text), optionally (B) an architecture diagram summary, (C) config/log/code excerpts, and (D) an optional "what_if" change.

Tasks:
1) Summarize system components and trust boundaries.
2) Identify 1–3 plausible attacker entry points (defensive, high-level).
3) Construct up to 2 attack paths (chains) from entry → impact.
   - Each step must be described WITHOUT exploit instructions.
   - Each step must include: why it is plausible, required preconditions, and defensive signals to watch.
4) Provide a prioritized mitigation plan that breaks the chain early.
5) If "what_if" is provided, update the attack paths and mitigation priorities accordingly, and explain what changed.

Return JSON exactly following this schema:
{
  "system_summary": {
    "assets": ["..."],
    "components": ["..."],
    "trust_boundaries": ["..."],
    "assumptions": ["..."]
  },
  "top_risks": [
    {"risk": "...", "why_it_matters": "...", "likelihood": "low|medium|high", "impact": "low|medium|high"}
  ],
  "attack_paths": [
    {
      "name": "...",
      "entry_point": "...",
      "preconditions": ["..."],
      "steps": [
        {
          "step": 1,
          "action_high_level": "...",
          "why_plausible": "...",
          "defender_signals": ["..."],
          "mitigations": ["..."]
        }
      ],
      "end_impact": "...",
      "overall_risk": "low|medium|high"
    }
  ],
  "what_if": {
    "change": "...",
    "delta_summary": ["..."],
    "updated_risks": ["..."]
  },
  "priority_fixes": [
    {"fix": "...", "breaks_chain_at": "path_name:step#", "effort": "low|medium|high", "risk_reduction": "low|medium|high"}
  ],
  "safe_notes": ["..."]
}

Formatting rules:
- No markdown fences in the final output, only JSON.
- No offensive payloads, no commands for compromise.
- Keep each string concise; this is for an interactive demo UI.`;

const MAX_TOTAL_CHARS = 25000;
const EXPLOIT_KEYWORDS = [
  "payload",
  "reverse shell",
  "metasploit",
  "sqlmap",
  "exploit",
  "shellcode",
  "cmd.exe",
  "powershell -enc",
  "dropper"
];

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type AnalysisInput = {
  project_name?: string;
  system_text: string;
  diagram_summary?: string;
  snippets?: {
    config?: string;
    logs?: string;
    code?: string;
  };
  what_if?: string | null;
};

function buildUserPrompt(input: AnalysisInput) {
  return `system_text:\n${input.system_text}\n\n` +
    `diagram_summary:\n${input.diagram_summary ?? ""}\n\n` +
    `snippets:\nconfig:\n${input.snippets?.config ?? ""}\nlogs:\n${input.snippets?.logs ?? ""}\ncode:\n${input.snippets?.code ?? ""}\n\n` +
    `what_if:\n${input.what_if ?? "NONE"}`;
}

function totalInputLength(input: AnalysisInput) {
  return (
    input.system_text.length +
    (input.diagram_summary?.length ?? 0) +
    (input.snippets?.config?.length ?? 0) +
    (input.snippets?.logs?.length ?? 0) +
    (input.snippets?.code?.length ?? 0)
  );
}

function extractText(response: GeminiResponse) {
  const text = response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  return text?.trim() ?? "";
}

function sanitizeOutput(jsonString: string) {
  let sanitized = jsonString;
  let redacted = false;
  for (const keyword of EXPLOIT_KEYWORDS) {
    const regex = new RegExp(keyword, "gi");
    if (regex.test(sanitized)) {
      sanitized = sanitized.replace(regex, "[redacted]");
      redacted = true;
    }
  }
  return { sanitized, redacted };
}

async function callGemini({ apiKey, model, messages }: { apiKey: string; model: string; messages: unknown }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: messages,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048
        }
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${details}`);
  }

  return (await response.json()) as GeminiResponse;
}

async function parseGeminiJson({ apiKey, model, userPrompt }: { apiKey: string; model: string; userPrompt: string }) {
  const baseMessages = [
    {
      role: "system",
      parts: [{ text: SYSTEM_PROMPT }]
    },
    {
      role: "user",
      parts: [{ text: DEVELOPER_PROMPT }]
    },
    {
      role: "user",
      parts: [{ text: userPrompt }]
    }
  ];

  const initialResponse = await callGemini({ apiKey, model, messages: baseMessages });
  const initialText = extractText(initialResponse);

  try {
    return { parsed: JSON.parse(initialText), raw: initialText };
  } catch {
    const repairMessages = [
      {
        role: "system",
        parts: [{ text: SYSTEM_PROMPT }]
      },
      {
        role: "user",
        parts: [{ text: "Return valid JSON only matching the required schema. Fix the following output." }]
      },
      {
        role: "user",
        parts: [{ text: initialText }]
      }
    ];

    const repairResponse = await callGemini({ apiKey, model, messages: repairMessages });
    const repairText = extractText(repairResponse);

    try {
      return { parsed: JSON.parse(repairText), raw: repairText };
    } catch {
      throw new Error(repairText || initialText);
    }
  }
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL ?? "gemini-3";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY environment variable." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as AnalysisInput;

    if (!body.system_text || body.system_text.trim().length === 0) {
      return NextResponse.json({ error: "System snapshot is required." }, { status: 400 });
    }

    if (totalInputLength(body) > MAX_TOTAL_CHARS) {
      return NextResponse.json(
        { error: "Input too large. Please keep total input under 25k characters." },
        { status: 400 }
      );
    }

    const userPrompt = buildUserPrompt(body);
    const { parsed, raw } = await parseGeminiJson({ apiKey, model, userPrompt });

    const rawString = JSON.stringify(parsed, null, 2);
    const { sanitized, redacted } = sanitizeOutput(rawString);
    const sanitizedJson = JSON.parse(sanitized);

    if (redacted) {
      sanitizedJson.safe_notes = Array.isArray(sanitizedJson.safe_notes)
        ? ["Some potentially unsafe terms were redacted.", ...sanitizedJson.safe_notes]
        : ["Some potentially unsafe terms were redacted."];
    }

    return NextResponse.json(sanitizedJson, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to analyze attack paths.",
        details: error instanceof Error ? error.message : "Unknown error.",
        raw_output: error instanceof Error ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
