import type { ReactNode } from "react";
import type { CheckStatus } from "../src/structured";
import type { Provenance } from "../src/ctgov";
import { DISCLAIMER } from "../src/checklist";

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v1" />
      </>
    ),
    question: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 2v1" />
      </>
    ),
    print: (
      <>
        <path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7Z" />
        <path d="M17 11h1" />
      </>
    ),
    sheet: (
      <>
        <path d="M6 3h8l4 4v14H6Zm8 0v5h4M9 12h6m-6 4h6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="15" cy="17" r="3" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6m0-6-9 9M10 4H4v16h16v-6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.info}
    </svg>
  );
}

export function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <Icon
        size={17}
        name={
          status === "matched"
            ? "check"
            : status === "not_matched"
              ? "info"
              : "question"
        }
      />
      {status === "matched"
        ? "Auto-checked"
        : status === "not_matched"
          ? "May not match"
          : "Ask your doctor"}
    </span>
  );
}

export function Notice() {
  return (
    <aside className="notice">
      <Icon name="info" size={25} />
      <p>{DISCLAIMER}</p>
    </aside>
  );
}

export function ProvenanceLine({ source }: { source: Provenance }) {
  return (
    <details className="provenance">
      <summary>
        Data from ClinicalTrials.gov{" "}
        <span>· Processed {formatDate(source.processedAt)}</span>
      </summary>
      <dl>
        <dt>Retrieved</dt>
        <dd>{source.retrievedAt}</dd>
        <dt>Processed by this tool</dt>
        <dd>{source.processedAt}</dd>
        <dt>API response date</dt>
        <dd>
          {source.apiResponseDate ?? "Not exposed by the API to this browser"}
        </dd>
        <dt>Record last updated</dt>
        <dd>{source.lastUpdatePosted ?? "Not provided"}</dd>
      </dl>
      <a href={source.url} target="_blank" rel="noreferrer">
        Open the original registry record <Icon name="external" size={14} />
      </a>
    </details>
  );
}

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
