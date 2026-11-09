import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  searchTrials,
  getTrial,
  type SearchResult,
  type SearchOptions,
  type Trial,
} from "../src/ctgov";
import {
  buildChecklist,
  MODIFICATION_NOTICE,
  type Checklist,
  type ChecklistItem,
} from "../src/checklist";
import { checkStructured, type UserProfile } from "../src/structured";
import { createSheet } from "../src/sheet";
import type { LlmOptions } from "../src/plain";
import { Icon, Notice, ProvenanceLine, StatusBadge } from "./components";

type Step = "search" | "trials" | "questions" | "sheet";
const steps: Step[] = ["search", "trials", "questions", "sheet"];
const stepNames = ["Search", "Trials", "Questions", "Visit sheet"];
const fieldQuestions = {
  minimumAge: "Is my age at least the study’s minimum?",
  maximumAge: "Is my age within the study’s maximum?",
  sex: "Does the registry’s sex field apply to me?",
  healthyVolunteers: "How does the healthy-volunteer condition apply to me?",
};
const sectionNames = {
  inclusion: "Inclusion criteria",
  exclusion: "Exclusion criteria",
  unspecified: "Other criteria · section not specified",
};
const fallbackNames = {
  numbers: "The number or unit check did not pass.",
  forbidden_claim: "The rewrite did not pass the participation-claim check.",
  question_shape: "The rewrite did not pass the question-format check.",
  llm_error: "The AI service could not return a question.",
};
const readmeUrl =
  "https://github.com/driedsandwich/trial-questions#ai-agents-mcp-over-stdio";

function locationText(trial: Trial) {
  const places = [
    ...new Set(
      (trial.locations ?? [])
        .map((l) => [l.city, l.state, l.country].filter(Boolean).join(", "))
        .filter(Boolean),
    ),
  ];
  return places.length
    ? `${places[0]}${places.length > 1 ? ` · +${places.length - 1} more locations` : ""}`
    : "Location not provided";
}

export function App() {
  const [step, setStep] = useState<Step>("search");
  const [condition, setCondition] = useState("");
  const [region, setRegion] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<UserProfile["sex"]>("UNKNOWN");
  const [results, setResults] = useState<SearchResult>();
  const [filters, setFilters] = useState<SearchOptions>();
  const [trial, setTrial] = useState<Trial>();
  const [baseChecklist, setChecklist] = useState<Checklist>();
  const [included, setIncluded] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<(() => void) | undefined>();
  const [aiOpen, setAiOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [key, setKey] = useState("");
  const [endpoint, setEndpoint] = useState(
    "https://api.openai.com/v1/chat/completions",
  );
  const [model, setModel] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [stacked, setStacked] = useState(false);
  const [sheetReady, setSheetReady] = useState(false);
  const aiDialog = useRef<HTMLDialogElement>(null);
  const agentDialog = useRef<HTMLDialogElement>(null);
  const sheetFrame = useRef<HTMLIFrameElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef(0);
  const aiAbort = useRef<AbortController | undefined>(undefined);
  const searchInput = useRef<HTMLInputElement>(null);
  const profile = useMemo<UserProfile>(
    () => ({
      age:
        age.trim() && Number.isFinite(Number(age)) && Number(age) >= 0
          ? Number(age)
          : undefined,
      sex,
    }),
    [age, sex],
  );
  const checklist = useMemo(
    () =>
      baseChecklist && trial
        ? {
            ...baseChecklist,
            structured: checkStructured(trial.eligibility, profile),
          }
        : undefined,
    [baseChecklist, trial, profile],
  );
  const sheet = useMemo(
    () =>
      checklist
        ? createSheet(
            {
              ...checklist,
              items: checklist.items.filter((i) => included.includes(i.id)),
            },
            { notes },
          )
        : undefined,
    [checklist, included, notes],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(Boolean(busy)), 8000);
    setSlow(false);
    return () => clearTimeout(timer);
  }, [busy]);
  useEffect(() => {
    if (aiOpen) aiDialog.current?.showModal();
    else aiDialog.current?.close();
  }, [aiOpen]);
  useEffect(() => {
    if (agentsOpen) agentDialog.current?.showModal();
    else agentDialog.current?.close();
  }, [agentsOpen]);
  useEffect(() => {
    if (step !== "search") heading.current?.focus({ preventScroll: true });
  }, [step, checklist?.nctId]);
  useEffect(() => {
    setSheetReady(false);
  }, [sheet]);
  useEffect(
    () => () => {
      request.current++;
      aiAbort.current?.abort();
    },
    [],
  );

  function go(next: Step) {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function findTrials(options: SearchOptions, append = false) {
    const version = ++request.current;
    aiAbort.current?.abort();
    setBusy(
      append
        ? "Loading more recruiting trials…"
        : "Searching ClinicalTrials.gov…",
    );
    setError("");
    setRetry(undefined);
    if (!append) {
      setResults(undefined);
      setTrial(undefined);
      setChecklist(undefined);
      setIncluded([]);
      setNotes("");
      setFilters(options);
      go("trials");
    }
    try {
      const next = await searchTrials(options);
      if (request.current !== version) return;
      setResults((previous) =>
        append && previous
          ? {
              ...next,
              trials: [
                ...previous.trials,
                ...next.trials.filter(
                  (t) => !previous.trials.some((p) => p.nctId === t.nctId),
                ),
              ],
            }
          : next,
      );
    } catch {
      if (request.current !== version) return;
      setError(
        "ClinicalTrials.gov could not be reached. Check your connection and try again. Your search has been kept.",
      );
      setRetry(() => () => void findTrials(options, append));
    } finally {
      if (request.current === version) setBusy("");
    }
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    void findTrials({ condition, region, status: ["RECRUITING"], pageSize: 9 });
  }
  async function selectTrial(id: string) {
    const version = ++request.current;
    aiAbort.current?.abort();
    setBusy("Fetching the latest trial criteria…");
    setError("");
    setRetry(undefined);
    setChecklist(undefined);
    setTrial(undefined);
    setNotes("");
    go("questions");
    try {
      const selected = await getTrial(id);
      if (request.current !== version) return;
      const next = await buildChecklist(selected);
      if (request.current !== version) return;
      setTrial(selected);
      setChecklist(next);
      setIncluded(next.items.slice(0, 3).map((i) => i.id));
    } catch {
      if (request.current !== version) return;
      setError(
        "The latest criteria could not be loaded. Try again, or choose another trial.",
      );
      setRetry(() => () => void selectTrial(id));
    } finally {
      if (request.current === version) setBusy("");
    }
  }
  function toggleItem(id: string) {
    setIncluded((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }
  async function rewriteWithAi(event: FormEvent) {
    event.preventDefault();
    let url: URL;
    try {
      url = new URL(endpoint);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
    } catch {
      setSettingsError(
        "Enter a full HTTPS endpoint without credentials, query parameters, or a fragment.",
      );
      return;
    }
    if (!trial || !checklist?.items.length || !key.trim() || !model.trim()) {
      setSettingsError(
        "Select a trial with criteria, and enter your key and model.",
      );
      return;
    }
    const selected = trial;
    const version = ++request.current;
    const controller = new AbortController();
    aiAbort.current = controller;
    let done = 0;
    const total = checklist.items.length;
    const options: LlmOptions = {
      apiKey: key.trim(),
      model: model.trim(),
      endpoint: url.href,
      fetcher: async (input, init) => {
        controller.signal.throwIfAborted();
        setBusy(`Rewriting question ${++done} of ${total}…`);
        return fetch(input, {
          ...init,
          signal: AbortSignal.any([
            controller.signal,
            init?.signal ?? AbortSignal.timeout(30_000),
          ]),
        });
      },
    };
    setSettingsError("");
    setAiOpen(false);
    setError("");
    setRetry(undefined);
    setBusy("Preparing AI rewrites…");
    try {
      const next = await buildChecklist(selected, {}, options);
      if (request.current === version) setChecklist(next);
    } catch {
      if (request.current === version)
        setError(
          "AI rewriting could not finish. The previous questions are still available.",
        );
    } finally {
      if (request.current === version) {
        setBusy("");
        aiAbort.current = undefined;
      }
    }
  }
  function cancelAi() {
    request.current++;
    aiAbort.current?.abort();
    aiAbort.current = undefined;
    setBusy("");
  }
  const mode = checklist?.items.some((i) => i.rewrite.mode === "llm")
    ? "AI-assisted · checks applied"
    : "Rule-based · no AI key needed";
  const selectedCount = included.length;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="wordmark"
            href={import.meta.env.BASE_URL}
            onClick={(event) => {
              event.preventDefault();
              go("search");
            }}
          >
            Trial Questions<span className="brand-dot">.</span>
          </a>
          <nav aria-label="Your progress" className="steps">
            {steps.map((s, index) => (
              <Fragment key={s}>
                {index > 0 && <span className="step-line" aria-hidden="true" />}
                <button
                  type="button"
                  aria-current={step === s ? "step" : undefined}
                  disabled={
                    (s === "trials" && !results && step !== "trials") ||
                    ((s === "questions" || s === "sheet") && !checklist)
                  }
                  onClick={() => go(s)}
                >
                  <span className="step-number">
                    {steps.indexOf(step) > index ? (
                      <Icon name="check" size={14} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span>{stepNames[index]}</span>
                </button>
              </Fragment>
            ))}
          </nav>
          <span className="header-note">
            A little preparation.
            <br />A clearer conversation.
          </span>
        </div>
      </header>
      <main id="main" className={`page page-${step}`}>
        {step === "search" && (
          <section className="intro" aria-labelledby="intro-title">
            <div>
              <p className="eyebrow">FROM TRIAL CRITERIA TO DOCTOR QUESTIONS</p>
              <h1 id="intro-title">
                Make room for
                <br />
                <span>a clearer conversation.</span>
              </h1>
              <p className="intro-copy">
                Clinical trial conditions can be hard to read.
                <br className="desktop-break" /> Turn them into questions you
                can bring to your doctor.
              </p>
            </div>
            <div className="intro-aside">
              <span className="outline-icon">
                <Icon name="sheet" size={28} />
              </span>
              <p>
                Keep the original.
                <br />
                <strong>Find the question.</strong>
              </p>
              <span className="small">Read them together, side by side.</span>
            </div>
          </section>
        )}

        {step !== "sheet" && (
          <section
            className={`search-panel ${step === "search" ? "" : "compact"}`}
            aria-label="Find clinical trials"
          >
            {step === "search" && (
              <div className="search-intro">
                <span className="small-index">01</span>
                <p>Start with a condition, or choose an example below.</p>
              </div>
            )}
            <form onSubmit={submitSearch} className="search-form">
              <label className="condition-field">
                Condition
                <div className="input-icon">
                  <Icon name="search" />
                  <input
                    ref={searchInput}
                    name="condition"
                    placeholder="e.g. asthma"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    required
                    maxLength={200}
                  />
                </div>
              </label>
              <label className="location-field">
                Location <span className="optional">optional</span>
                <div className="input-icon">
                  <Icon name="pin" />
                  <input
                    name="location"
                    placeholder="City, state, or country"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    maxLength={200}
                  />
                </div>
              </label>
              <button
                className="primary find-button"
                type="submit"
                disabled={Boolean(busy)}
              >
                Find trials <Icon name="arrow" />
              </button>
            </form>
            {step === "search" && (
              <div className="examples">
                <span>Try a condition</span>
                {["Asthma", "Type 2 diabetes", "Breast cancer"].map(
                  (example) => (
                    <button
                      className="example"
                      key={example}
                      type="button"
                      onClick={() => {
                        const value = example.toLowerCase();
                        setCondition(value);
                        // One tap runs the search so first-time visitors reach real trials immediately.
                        void findTrials({ condition: value, region, status: ["RECRUITING"], pageSize: 9 });
                      }}
                    >
                      {example}
                      <span aria-hidden="true">↗</span>
                    </button>
                  ),
                )}
              </div>
            )}
            <div className="search-options">
              <details className="profile">
                <summary>
                  <Icon name="settings" size={16} /> Optional age &amp; sex{" "}
                  <span className="local-label">· stays on this device</span>
                </summary>
                <div className="profile-fields">
                  <label>
                    Age in years
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      placeholder="Not entered"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                    />
                  </label>
                  <label>
                    Sex as entered
                    <select
                      aria-label="Sex as entered"
                      value={sex}
                      onChange={(e) =>
                        setSex(e.target.value as UserProfile["sex"])
                      }
                    >
                      <option value="UNKNOWN">Prefer not to say</option>
                      <option value="FEMALE">Female</option>
                      <option value="MALE">Male</option>
                      <option value="OTHER">Other / not represented</option>
                    </select>
                  </label>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setAge("");
                      setSex("UNKNOWN");
                    }}
                  >
                    Clear
                  </button>
                  <p className="small">
                    Compared only with explicit registry age and sex fields.
                    These values are not sent to any service or saved.
                  </p>
                </div>
              </details>
              <button
                className="text-button ai-entry"
                onClick={() => setAiOpen(true)}
              >
                <Icon name="settings" size={16} /> Optional AI rewriting
              </button>
            </div>
            {step === "search" && (
              <p className="privacy-line">
                <Icon name="lock" size={15} /> Free to use. Only your trial
                search goes to ClinicalTrials.gov; personal details stay here.
                Optional AI may incur provider charges.
              </p>
            )}
          </section>
        )}

        {busy && (
          <div className="loading-panel" role="status">
            <span className="spinner" />
            <div>
              <strong>{busy}</strong>
              <p>
                {slow
                  ? "This is taking longer than usual. Requests time out after 30 seconds; large AI rewrites take longer."
                  : "Keeping the source and its questions together."}
              </p>
            </div>
            {aiAbort.current && (
              <button className="secondary" onClick={cancelAi}>
                Cancel rewriting
              </button>
            )}
          </div>
        )}
        {error && (
          <div className="error-panel" role="alert">
            <Icon name="info" />
            <div>
              <strong>Something interrupted the request</strong>
              <p>{error}</p>
            </div>
            {retry && (
              <button className="secondary" onClick={retry}>
                Try again
              </button>
            )}
          </div>
        )}

        {step === "search" && (
          <section className="how-it-works" aria-label="How it works">
            {[
              [
                "01",
                "Find a recruiting trial",
                "Search current records from ClinicalTrials.gov. No account or key needed.",
                "search",
              ],
              [
                "02",
                "Read the source & question",
                "See each original condition beside a question, with a reason for its status.",
                "question",
              ],
              [
                "03",
                "Bring it to your doctor",
                "Choose your questions, add a note, and print a visit sheet or save it as a PDF.",
                "sheet",
              ],
            ].map(([n, title, copy, icon]) => (
              <div key={n}>
                <div className="how-top">
                  <span>{n}</span>
                  <Icon name={icon!} size={22} />
                </div>
                <h2>{title}</h2>
                <p>{copy}</p>
              </div>
            ))}
          </section>
        )}

        {step === "trials" && (
          <section className="results" aria-labelledby="results-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">02 / CHOOSE A TRIAL</p>
                <h1 ref={heading} tabIndex={-1} id="results-title">
                  A starting point for your questions.
                </h1>
                <p>
                  {results
                    ? `${results.totalCount?.toLocaleString() ?? results.trials.length} recruiting ${results.totalCount === 1 ? "trial" : "trials"} found`
                    : "Recruiting trials"}
                  {filters?.condition ? ` for “${filters.condition}”` : ""}
                  {filters?.region ? ` · ${filters.region}` : ""}
                </p>
              </div>
              <span className="mode-badge">Live registry search</span>
            </div>
            {results && !results.trials.length && (
              <div className="empty-state">
                <Icon name="search" size={32} />
                <h2>No recruiting trials found</h2>
                <p>
                  Try a broader condition or remove the location. A search
                  result is not a participation decision.
                </p>
                <button
                  className="secondary"
                  onClick={() => {
                    setRegion("");
                    searchInput.current?.focus();
                  }}
                >
                  Adjust search
                </button>
              </div>
            )}
            {results && results.trials.length > 0 && (
              <>
                <p className="small results-help">
                  Select a trial to read its criteria. Registry order is shown;
                  results are not recommendations. Site availability may differ.
                </p>
                <div className="trial-grid">
                  {results.trials.map((t) => (
                    <button
                      className="trial-card"
                      key={t.nctId}
                      onClick={() => void selectTrial(t.nctId)}
                      disabled={Boolean(busy)}
                    >
                      <span className="trial-top">
                        <span>{t.nctId}</span>
                        <span className="recruiting">
                          {t.overallStatus.replaceAll("_", " ").toLowerCase()}
                        </span>
                      </span>
                      <h2>{t.title}</h2>
                      <span className="trial-location">
                        <Icon name="pin" size={17} />
                        {locationText(t)}
                      </span>
                      <span className="trial-action">
                        Read conditions <Icon name="arrow" size={18} />
                      </span>
                    </button>
                  ))}
                </div>
                {results.nextPageToken && (
                  <button
                    className="secondary load-more"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void findTrials(
                        { ...filters, pageToken: results.nextPageToken },
                        true,
                      )
                    }
                  >
                    Load more trials
                  </button>
                )}
                <ProvenanceLine source={results.source} />
              </>
            )}
          </section>
        )}

        {step === "questions" && checklist && trial && (
          <section aria-labelledby="questions-title">
            <div className="selected-trial">
              <div>
                <div className="trial-top">
                  <span>SELECTED TRIAL · {trial.nctId}</span>
                  <span className="recruiting">
                    {trial.overallStatus.replaceAll("_", " ").toLowerCase()}
                  </span>
                </div>
                <h2>{trial.title}</h2>
                <p>
                  <Icon name="pin" size={16} />
                  {locationText(trial)}
                </p>
              </div>
              <button className="text-button" onClick={() => go("trials")}>
                Change trial <Icon name="arrow" size={17} />
              </button>
            </div>
            <div className="section-heading questions-heading">
              <div>
                <p className="eyebrow">03 / READ TOGETHER</p>
                <h1 id="questions-title" tabIndex={-1} ref={heading}>
                  From trial conditions to doctor questions
                </h1>
                <p>
                  {checklist.items.length} original conditions · {selectedCount}{" "}
                  selected for your visit
                </p>
              </div>
              <button className="primary" onClick={() => go("sheet")}>
                <Icon name="sheet" /> Prepare visit sheet{" "}
                <span className="button-count">{selectedCount}</span>
              </button>
            </div>
            <p className="modification">{MODIFICATION_NOTICE}</p>
            <div className="reading-tools">
              <span className="mode-badge">
                <Icon name="check" size={14} />
                {mode}
              </span>
              <div>
                <button
                  className="text-button"
                  aria-pressed={stacked}
                  onClick={() => setStacked(!stacked)}
                >
                  {stacked ? "Side-by-side view" : "Stacked reading view"}
                </button>
                <button className="text-button" onClick={() => setAiOpen(true)}>
                  AI settings
                </button>
              </div>
            </div>
            <details className="status-guide">
              <summary>What do these labels mean?</summary>
              <div>
                <p>
                  <StatusBadge status="matched" /> A comparison with an explicit
                  entered value, for that registry field only.
                </p>
                <p>
                  <StatusBadge status="ask_doctor" /> Medical interpretation,
                  missing information, or an unclear condition needs discussion.
                </p>
                <p>
                  <StatusBadge status="not_matched" /> A field comparison found
                  a possible difference to discuss; this is not an exclusion
                  decision.
                </p>
                <p>
                  Number checks compare values and units; they do not verify
                  medical meaning.
                </p>
              </div>
            </details>
            <div className={`paired-list ${stacked ? "stacked" : ""}`}>
              <div className="column-headings">
                <h2>Original trial conditions</h2>
                <span />
                <h2>Questions for your doctor</h2>
              </div>
              {!checklist.items.length && (
                <div className="empty-state">
                  <Icon name="sheet" size={30} />
                  <h2>No criteria text was supplied</h2>
                  <p>
                    This record has no original criteria to turn into questions.
                    Check the registry record or choose another trial.
                  </p>
                  <a href={trial.source.url} target="_blank" rel="noreferrer">
                    View ClinicalTrials.gov <Icon name="external" size={16} />
                  </a>
                </div>
              )}
              {checklist.items.map((item, index) => (
                <Fragment key={item.id}>
                  {(index === 0 ||
                    checklist.items[index - 1]?.section !== item.section) && (
                    <h2 className="criteria-section">
                      {sectionNames[item.section]}
                      <span>
                        {item.section === "exclusion"
                          ? "Conditions that may prevent joining"
                          : item.section === "inclusion"
                            ? "Conditions the study asks for"
                            : "Kept in the source order"}
                      </span>
                    </h2>
                  )}
                  <PairedConditionRow
                    item={item}
                    index={index}
                    selected={included.includes(item.id)}
                    toggle={() => toggleItem(item.id)}
                  />
                </Fragment>
              ))}
              <h2 className="criteria-section">
                Registry fields
                <span>Separate comparisons · each field only</span>
              </h2>
              <p className="field-intro">
                These fields come from the registry. They do not automatically
                verify any written condition above.
              </p>
              {checklist.structured.map((field, index) => (
                <article
                  className="paired-row structured-row"
                  key={field.field}
                  tabIndex={0}
                  aria-label={`Registry field ${index + 1}: ${field.field}`}
                >
                  <div className="source-cell">
                    <span className="source-ref">
                      Field {index + 1} · Registry
                    </span>
                    <p>{field.original}</p>
                  </div>
                  <div className="connector" aria-hidden="true">
                    <span />
                  </div>
                  <div className="question-cell">
                    <div className="question-top">
                      <span className="mobile-ref">
                        Field {index + 1} · Question
                      </span>
                      <StatusBadge status={field.status} />
                    </div>
                    <h3>{fieldQuestions[field.field]}</h3>
                    {field.field === "minimumAge" ||
                    field.field === "maximumAge" ? (
                      <p className="basis">
                        {profile.age === undefined
                          ? "Age not entered."
                          : `Age ${profile.age} years · self-reported.`}{" "}
                        {field.reason}
                      </p>
                    ) : (
                      <p className="basis">
                        {field.field === "sex"
                          ? `Entered sex: ${sex === "UNKNOWN" ? "not provided" : sex?.toLowerCase()}. `
                          : ""}
                        {field.reason}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {checklist.warnings.length > 0 && (
              <div className="source-warnings">
                {checklist.warnings.map((w) => (
                  <p key={w}>
                    <Icon name="info" size={16} />
                    {w}
                  </p>
                ))}
              </div>
            )}
            <div className="end-actions">
              <p>
                <strong>Ready for the conversation?</strong>
                <br />
                <span>
                  {selectedCount} questions selected. You can change your
                  selection on the visit sheet.
                </span>
              </p>
              <button className="primary" onClick={() => go("sheet")}>
                Prepare visit sheet <Icon name="arrow" />
              </button>
            </div>
            <ProvenanceLine source={checklist.source} />
          </section>
        )}

        {step === "sheet" && checklist && sheet && (
          <section aria-labelledby="sheet-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">04 / TAKE THE CONVERSATION WITH YOU</p>
                <h1 ref={heading} tabIndex={-1} id="sheet-title">
                  Your next visit, a little more prepared.
                </h1>
                <p>
                  Choose the questions that matter to you. Bring the original
                  text along.
                </p>
              </div>
              <button className="secondary" onClick={() => go("questions")}>
                Back to questions
              </button>
            </div>
            <div className="sheet-layout">
              <div className="sheet-controls">
                <h2>Make it your visit sheet</h2>
                <p className="small">
                  The first three questions are selected to start. All four
                  registry fields are included.
                </p>
                <div className="selection-actions">
                  <strong>
                    {selectedCount} of {checklist.items.length} selected
                  </strong>
                  <button
                    className="text-button"
                    onClick={() =>
                      setIncluded(checklist.items.map((i) => i.id))
                    }
                  >
                    Select all
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setIncluded([])}
                  >
                    Clear
                  </button>
                </div>
                <div className="sheet-selection">
                  {checklist.items.map((item, index) => (
                    <label key={item.id}>
                      <input
                        type="checkbox"
                        checked={included.includes(item.id)}
                        onChange={() => toggleItem(item.id)}
                      />
                      <span>
                        <strong>
                          §{String(index + 1).padStart(2, "0")} ·{" "}
                          {sectionNames[item.section]}
                        </strong>
                        {item.rewrite.displayText}
                      </span>
                    </label>
                  ))}
                </div>
                <label className="notes-label">
                  Notes for my doctor
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What would you like to discuss?"
                    maxLength={3000}
                  />
                </label>
                <p className="small">
                  <Icon name="lock" size={13} /> Notes stay in this tab until
                  you print or save the sheet.
                </p>
                <button
                  className="primary print-button"
                  disabled={!sheetReady}
                  onClick={() => {
                    sheetFrame.current?.contentWindow?.focus();
                    sheetFrame.current?.contentWindow?.print();
                  }}
                >
                  <Icon name="print" /> Print / Save PDF
                </button>
                <p className="small">
                  Choose “Save as PDF” in your browser’s print dialog. A long
                  selection may need more than one page; check print preview.
                </p>
              </div>
              <div className="paper-preview">
                <div className="preview-label">
                  <span>VISIT SHEET PREVIEW</span>
                  <span>Originals + questions + notes</span>
                </div>
                <iframe
                  title="Printable visit sheet"
                  ref={sheetFrame}
                  srcDoc={sheet.html}
                  sandbox="allow-same-origin allow-modals"
                  onLoad={() => setSheetReady(true)}
                />
              </div>
            </div>
            <ProvenanceLine source={checklist.source} />
          </section>
        )}

        <Notice />
        {(step === "search" || step === "trials") && (
          <p className="footer-modification">{MODIFICATION_NOTICE}</p>
        )}
        <footer className="site-footer">
          <a href="https://clinicaltrials.gov" target="_blank" rel="noreferrer">
            Data from ClinicalTrials.gov <Icon name="external" size={13} />
          </a>
          <span>Built for better questions.</span>
          <button className="text-button" onClick={() => setAgentsOpen(true)}>
            For AI agents · MCP tools <Icon name="arrow" size={15} />
          </button>
        </footer>
      </main>

      <dialog
        ref={aiDialog}
        onCancel={() => setAiOpen(false)}
        onClose={() => setAiOpen(false)}
        aria-labelledby="ai-title"
      >
        <div className="dialog-heading">
          <span className="eyebrow">OPTIONAL · YOUR PROVIDER, YOUR KEY</span>
          <button
            className="icon-button"
            aria-label="Close AI settings"
            onClick={() => setAiOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id="ai-title">A little help with the wording</h2>
        <p>
          The rule-based questions work without an AI key. You can choose an
          OpenAI-compatible service to try rewriting the selected trial.
        </p>
        <form onSubmit={rewriteWithAi}>
          <label>
            Full HTTPS chat completions endpoint
            <input
              type="url"
              required
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Model
            <input
              required
              value={model}
              placeholder="Your provider’s model ID"
              onChange={(e) => setModel(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            API key <span className="optional">memory only</span>
            <input
              type="password"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="destination">
            <strong>Requests will be sent to</strong>
            <code>{endpoint || "Enter an endpoint above"}</code>
            <p>
              Only public criteria and their sections are sent, with your key.
              Age, sex, and notes stay here. Your provider may charge and retain
              requests. Browser access (CORS) must be supported by the provider.
            </p>
          </div>
          <p className="small">
            This tab does not save your key. Every rewrite is checked; rejected
            wording keeps the original text. Each new trial starts with
            rule-based questions.
          </p>
          {settingsError && (
            <p role="alert" className="form-error">
              {settingsError}
            </p>
          )}
          {!checklist?.items.length && (
            <p className="small">
              First select a trial with criteria to enable AI rewriting.
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setKey("");
                setSettingsError("");
              }}
            >
              Clear key
            </button>
            <button
              className="primary"
              type="submit"
              disabled={!checklist?.items.length || Boolean(busy)}
            >
              Rewrite this trial with AI
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={agentDialog}
        onCancel={() => setAgentsOpen(false)}
        onClose={() => setAgentsOpen(false)}
        aria-labelledby="agents-title"
      >
        <div className="dialog-heading">
          <span className="eyebrow">FOR DEVELOPERS &amp; AI AGENTS</span>
          <button
            className="icon-button"
            aria-label="Close agent information"
            onClick={() => setAgentsOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id="agents-title">The same questions, through MCP.</h2>
        <p>
          The repository includes a local MCP server over stdio. It uses the
          same live data and conversion core as this page. This website does not
          host an MCP endpoint.
        </p>
        <dl className="tool-list">
          <dt>
            <code>search_trials</code>
          </dt>
          <dd>
            Search current trials by condition, region, and recruitment status.
            Returns records, provenance, and pagination.
          </dd>
          <dt>
            <code>get_trial_checklist</code>
          </dt>
          <dd>
            Pass an NCT ID, with optional age and sex, to get original criteria,
            questions, individual field comparisons, and source dates.
          </dd>
        </dl>
        <p className="small">
          MCP uses the rule-based path and does not accept an AI key. Host
          applications may retain their own history.
        </p>
        <a
          className="primary"
          href={readmeUrl}
          target="_blank"
          rel="noreferrer"
        >
          README &amp; configuration example <Icon name="external" size={17} />
        </a>
        <p className="small">
          The repository link will be public when its owner publishes the
          repository.
        </p>
      </dialog>
    </>
  );
}

function PairedConditionRow({
  item,
  index,
  selected,
  toggle,
}: {
  item: ChecklistItem;
  index: number;
  selected: boolean;
  toggle: () => void;
}) {
  const reference = `§${String(index + 1).padStart(2, "0")}`;
  return (
    <article
      className="paired-row"
      tabIndex={0}
      aria-label={`Condition ${index + 1}`}
    >
      <div className="source-cell" id={`source-${item.id}`}>
        <a className="source-ref" href={`#question-${item.id}`}>
          Source {reference} <Icon name="arrow" size={14} />
        </a>
        {item.context.length > 0 && (
          <div className="parent-context">
            <span>Parent context</span>
            {item.context.map((p) => (
              <p key={p.id}>{p.original}</p>
            ))}
          </div>
        )}
        <p className="original-text">{item.original}</p>
        <span className="source-position">
          Original text · characters {item.start}–{item.end}
        </span>
      </div>
      <div className="connector" aria-hidden="true">
        <span />
      </div>
      <div className="question-cell" id={`question-${item.id}`}>
        <div className="question-top">
          <a className="question-ref" href={`#source-${item.id}`}>
            Question {reference}
          </a>
          <StatusBadge status={item.status} />
        </div>
        {item.rewrite.question ? (
          <h3>{item.rewrite.question}</h3>
        ) : (
          <>
            <span className="retained-label">
              Original retained · review with your doctor
            </span>
            <blockquote>{item.rewrite.displayText}</blockquote>
          </>
        )}
        <p className="basis">
          {item.rewrite.fallbackReason
            ? `${fallbackNames[item.rewrite.fallbackReason]} The original is shown instead.`
            : "This written condition needs your doctor’s interpretation."}
        </p>
        <div className="question-bottom">
          <span>
            {item.rewrite.mode === "rules" ? "Rule-based" : "AI-assisted"}
            {item.rewrite.numberCheck.passed
              ? " · number check passed"
              : " · original preserved"}
          </span>
          <label>
            <input type="checkbox" checked={selected} onChange={toggle} />
            Add to visit sheet<span className="sr-only"> {reference}</span>
          </label>
        </div>
        {item.rewrite.glossarySources.length > 0 && (
          <details className="glossary">
            <summary>
              Wording sources ({item.rewrite.glossarySources.length})
            </summary>
            {item.rewrite.glossarySources.map((s) => (
              <p key={s.term}>
                <a href={s.source} target="_blank" rel="noreferrer">
                  {s.term} <Icon name="external" size={12} />
                </a>{" "}
                — {s.plain}
              </p>
            ))}
          </details>
        )}
      </div>
    </article>
  );
}
