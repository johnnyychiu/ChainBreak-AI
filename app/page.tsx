"use client";

import { useMemo, useState } from "react";

type Risk = {
  risk: string;
  why_it_matters: string;
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
};

type AttackStep = {
  step: number;
  action_high_level: string;
  why_plausible: string;
  defender_signals: string[];
  mitigations: string[];
};

type AttackPath = {
  name: string;
  entry_point: string;
  preconditions: string[];
  steps: AttackStep[];
  end_impact: string;
  overall_risk: "low" | "medium" | "high";
};

type PriorityFix = {
  fix: string;
  breaks_chain_at: string;
  effort: "low" | "medium" | "high";
  risk_reduction: "low" | "medium" | "high";
};

type AnalysisResponse = {
  system_summary: {
    assets: string[];
    components: string[];
    trust_boundaries: string[];
    assumptions: string[];
  };
  top_risks: Risk[];
  attack_paths: AttackPath[];
  what_if: {
    change: string;
    delta_summary: string[];
    updated_risks: string[];
  };
  priority_fixes: PriorityFix[];
  safe_notes: string[];
};

type ErrorResponse = {
  error: string;
  details?: string;
  raw_output?: string;
};

const exampleData = {
  system_text:
    "Public web app with a REST API behind it. The web app is accessible from the internet. Authentication uses email/password. An admin panel exists for support staff. The API talks to a PostgreSQL database and object storage. Logs are shipped to a centralized logging service. Some endpoints are rate-limited, but admin login is not. A service account has broad permissions to storage. Secrets are stored as environment variables in the deployment.",
  diagram_summary:
    "Browser -> Web App -> REST API -> PostgreSQL + Object Storage; logs to centralized logging service. Admin panel reachable via web app.",
  snippets: {
    config:
      "IAM: service-account-01 has full access to storage buckets.\nAuth: MFA not enforced for admin accounts.",
    logs:
      "2024-07-06T12:22:01Z admin-login failed user=support@company.com ip=203.0.113.22\n2024-07-06T12:22:06Z admin-login failed user=support@company.com ip=203.0.113.22\n2024-07-06T12:22:10Z admin-login failed user=support@company.com ip=203.0.113.22",
    code: "if (!user.mfaEnabled && user.role === 'admin') {\n  // TODO: enforce MFA later\n}\nreturn sessionToken;"
  }
};

const whatIfOptions = [
  {
    label: "What-if: Enable MFA",
    value:
      "Enable MFA for all privileged accounts and enforce phishing-resistant MFA where possible."
  },
  {
    label: "What-if: Patch Exposed Service",
    value:
      "The exposed service is patched and now rejects unauthenticated requests; rate limiting is enabled."
  },
  {
    label: "What-if: Attacker Has Internal Access",
    value:
      "Assume the attacker has low-privilege internal network access (e.g., compromised employee device)."
  }
];

const tabLabels = ["Summary", "Attack Paths", "Priority Fixes", "What Changed"] as const;

type TabKey = (typeof tabLabels)[number];

export default function HomePage() {
  const [systemText, setSystemText] = useState("");
  const [diagramSummary, setDiagramSummary] = useState("");
  const [configSnippet, setConfigSnippet] = useState("");
  const [logSnippet, setLogSnippet] = useState("");
  const [codeSnippet, setCodeSnippet] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("Summary");
  const [rawOutput, setRawOutput] = useState<string | null>(null);
  const [lastWhatIf, setLastWhatIf] = useState<string | null>(null);

  const isAnalyzeDisabled = loading || systemText.trim().length === 0;

  const formattedRawJson = useMemo(() => {
    if (!analysis) {
      return null;
    }
    return JSON.stringify(analysis, null, 2);
  }, [analysis]);

  const runAnalysis = async (whatIf: string | null) => {
    setLoading(true);
    setError(null);
    setRawOutput(null);
    setLastWhatIf(whatIf);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          project_name: "ChainBreak AI",
          system_text: systemText,
          diagram_summary: diagramSummary,
          snippets: {
            config: configSnippet,
            logs: logSnippet,
            code: codeSnippet
          },
          what_if: whatIf
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload as ErrorResponse);
        setAnalysis(null);
        return;
      }

      setAnalysis(payload as AnalysisResponse);
      setActiveTab("Summary");
    } catch (requestError) {
      setError({
        error: "Unable to reach the analysis service.",
        details: requestError instanceof Error ? requestError.message : "Unknown error."
      });
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadExample = () => {
    setSystemText(exampleData.system_text);
    setDiagramSummary(exampleData.diagram_summary);
    setConfigSnippet(exampleData.snippets.config);
    setLogSnippet(exampleData.snippets.logs);
    setCodeSnippet(exampleData.snippets.code);
    setAnalysis(null);
    setError(null);
    setRawOutput(null);
  };

  const handleCopyJson = async () => {
    if (!formattedRawJson) {
      return;
    }
    await navigator.clipboard.writeText(formattedRawJson);
  };

  return (
    <div className="container">
      <header>
        <h1>ChainBreak AI</h1>
        <p>Real-time attack-path reasoning for defenders (no exploit instructions).</p>
      </header>

      <div className="main-grid">
        <section className="panel">
          <h2>Inputs</h2>
          <div className="field">
            <label htmlFor="system-text">System Snapshot *</label>
            <textarea
              id="system-text"
              placeholder="Describe components, auth, data stores, and external exposure."
              value={systemText}
              onChange={(event) => setSystemText(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="diagram-summary">Diagram Summary (optional)</label>
            <textarea
              id="diagram-summary"
              placeholder="Text summary of the architecture diagram (no OCR needed)."
              value={diagramSummary}
              onChange={(event) => setDiagramSummary(event.target.value)}
            />
          </div>

          <details className="field">
            <summary>Snippets (optional)</summary>
            <div className="field">
              <label htmlFor="config-snippet">Config</label>
              <textarea
                id="config-snippet"
                placeholder="Config snippet..."
                value={configSnippet}
                onChange={(event) => setConfigSnippet(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="logs-snippet">Logs</label>
              <textarea
                id="logs-snippet"
                placeholder="Log snippet..."
                value={logSnippet}
                onChange={(event) => setLogSnippet(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="code-snippet">Code Excerpt</label>
              <textarea
                id="code-snippet"
                placeholder="Code snippet..."
                value={codeSnippet}
                onChange={(event) => setCodeSnippet(event.target.value)}
              />
            </div>
          </details>

          <div className="input-row">
            <button
              className="button"
              onClick={() => runAnalysis(null)}
              disabled={isAnalyzeDisabled}
            >
              {loading ? "Analyzing..." : "Analyze Attack Paths"}
            </button>
            <button className="button secondary" onClick={handleLoadExample}>
              Load Example
            </button>
          </div>
          <p className="helper">What-if reruns reasoning and highlights changes.</p>
          <div className="input-row">
            {whatIfOptions.map((option) => (
              <button
                key={option.value}
                className="button ghost"
                onClick={() => runAnalysis(option.value)}
                disabled={isAnalyzeDisabled}
              >
                {option.label}
              </button>
            ))}
          </div>
          {loading && (
            <div className="input-row" style={{ marginTop: 12 }}>
              <div className="spinner" />
              <span className="helper">Calling Gemini 3 for defensive analysis...</span>
            </div>
          )}
          {error && (
            <div className="error" style={{ marginTop: 16 }}>
              <strong>{error.error}</strong>
              {error.details && <p>{error.details}</p>}
              {error.raw_output && (
                <details>
                  <summary>Raw model output</summary>
                  <pre>{error.raw_output}</pre>
                </details>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="input-row" style={{ justifyContent: "space-between" }}>
            <h2>Results</h2>
            <button className="button secondary" onClick={handleCopyJson}>
              Copy JSON
            </button>
          </div>
          {!analysis && !error && (
            <div className="callout">
              <p>
                Provide a system snapshot and run analysis to see structured attack-path reasoning.
              </p>
            </div>
          )}

          {analysis && (
            <>
              {lastWhatIf && (
                <p className="helper">Latest what-if: {lastWhatIf}</p>
              )}
              <div className="tabs">
                {tabLabels.map((tab) => (
                  <button
                    key={tab}
                    className={`tab ${activeTab === tab ? "active" : ""}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="section">
                {activeTab === "Summary" && (
                  <>
                    <div className="card">
                      <h3>Components</h3>
                      <ul className="list">
                        {analysis.system_summary.components.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="card">
                      <h3>Trust Boundaries</h3>
                      <ul className="list">
                        {analysis.system_summary.trust_boundaries.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="card">
                      <h3>Top Risks</h3>
                      {analysis.top_risks.map((risk) => (
                        <div key={risk.risk} className="card" style={{ marginBottom: 12 }}>
                          <strong>{risk.risk}</strong>
                          <p className="helper">{risk.why_it_matters}</p>
                          <div className="input-row">
                            <span className={`badge ${risk.likelihood}`}>Likelihood: {risk.likelihood}</span>
                            <span className={`badge ${risk.impact}`}>Impact: {risk.impact}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {activeTab === "Attack Paths" && (
                  <>
                    {analysis.attack_paths.map((path) => (
                      <div key={path.name} className="card">
                        <h3>{path.name}</h3>
                        <p className="helper">Entry: {path.entry_point}</p>
                        <p className="helper">End impact: {path.end_impact}</p>
                        <span className={`badge ${path.overall_risk}`}>Risk: {path.overall_risk}</span>
                        <h4>Preconditions</h4>
                        <ul className="list">
                          {path.preconditions.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                        <div className="section">
                          {path.steps.map((step) => (
                            <div key={step.step} className="card">
                              <strong>Step {step.step}: {step.action_high_level}</strong>
                              <p className="helper">Why plausible: {step.why_plausible}</p>
                              <p>Defender signals</p>
                              <ul className="list">
                                {step.defender_signals.map((signal) => (
                                  <li key={signal}>{signal}</li>
                                ))}
                              </ul>
                              <p>Mitigations</p>
                              <ul className="list">
                                {step.mitigations.map((mitigation) => (
                                  <li key={mitigation}>{mitigation}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {activeTab === "Priority Fixes" && (
                  <div className="table">
                    {analysis.priority_fixes.map((fix) => (
                      <div key={fix.fix} className="table-row">
                        <div>
                          <strong>{fix.fix}</strong>
                          <p className="helper">Breaks: {fix.breaks_chain_at}</p>
                        </div>
                        <div>
                          <span className={`badge ${fix.effort}`}>Effort: {fix.effort}</span>
                        </div>
                        <div>
                          <span className={`badge ${fix.risk_reduction}`}>Risk reduction: {fix.risk_reduction}</span>
                        </div>
                        <div>
                          <span className="badge">Priority Fix</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "What Changed" && (
                  <div className="card">
                    <h3>What-if change</h3>
                    <p>{analysis.what_if.change || "No what-if provided."}</p>
                    <h4>Delta Summary</h4>
                    <ul className="list">
                      {analysis.what_if.delta_summary.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <h4>Updated Risks</h4>
                    <ul className="list">
                      {analysis.what_if.updated_risks.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="callout">
                  <strong>Safety notes</strong>
                  <ul className="list">
                    {analysis.safe_notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>

                <details className="card" onToggle={(event) => {
                  const target = event.target as HTMLDetailsElement;
                  if (target.open && formattedRawJson) {
                    setRawOutput(formattedRawJson);
                  }
                }}>
                  <summary>Raw JSON</summary>
                  <pre>{rawOutput ?? formattedRawJson}</pre>
                </details>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
