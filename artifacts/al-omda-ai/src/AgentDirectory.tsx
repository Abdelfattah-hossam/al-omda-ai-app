import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Search,
  SlidersHorizontal,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import {
  summarizeSpecialty,
  matchesActivityFilter,
  type ActivityTask,
  type ActivityFilter,
} from "./lib/specialty-activity";
import "./agent-directory.css";

type SpecialtyInfo = {
  id: string;
  icon: LucideIcon;
  name: string;
  description: string;
  tag: string;
};
export default function AgentDirectory({
  specialties,
  tasks,
  ar,
  onSelect,
  compact = false,
}: {
  specialties: SpecialtyInfo[];
  tasks: ActivityTask[];
  ar: boolean;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState<ActivityFilter>("all");
  const [specialty, setSpecialty] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "specialty",
    );
    return specialties.some((item) => item.id === requested)
      ? requested!
      : "all";
  });
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      specialties.map((item) => ({
        ...item,
        summary: summarizeSpecialty(tasks, item.id),
      })),
    [specialties, tasks],
  );
  const visible = rows.filter(
    (row) =>
      (specialty === "all" || specialty === row.id) &&
      matchesActivityFilter(row.summary, activity) &&
      `${row.name} ${row.description}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const filters: Array<{ id: ActivityFilter; name: string }> = [
    { id: "all", name: ar ? "الكل" : "All" },
    { id: "attention", name: ar ? "تحتاج متابعة" : "Needs attention" },
    { id: "recorded", name: ar ? "لها مهام" : "With tasks" },
    { id: "unused", name: ar ? "بدون مهام" : "No tasks" },
  ];
  if (compact)
    return (
      <section
        className="directory-overview panel"
        aria-labelledby="directory-overview-title"
      >
        <div className="directory-section-head">
          <div>
            <span className="eyebrow">
              {ar ? "شبكة المتخصصين" : "SPECIALIST NETWORK"}
            </span>
            <h2 id="directory-overview-title">
              {ar ? "نشاط الوكلاء، في لمحة" : "Specialist activity at a glance"}
            </h2>
            <p>
              {ar
                ? "مهام محفوظة حسب التخصص، وليست مؤشرات تشغيل مباشر."
                : "Saved tasks by specialty, not live runtime indicators."}
            </p>
          </div>
          <Link
            href="/agents#agent-marketplace-grid"
            className="button button-quiet"
          >
            {ar ? "كل التخصصات" : "All specialties"}
            <ArrowLeft size={14} />
          </Link>
        </div>
        <div className="directory-overview-grid">
          {rows
            .slice()
            .sort((a, b) => b.summary.total - a.summary.total)
            .slice(0, 4)
            .map((row) => (
              <Link
                className="directory-mini"
                href={`/agents?specialty=${row.id}#agent-marketplace-grid`}
                key={row.id}
              >
                <span className="agent-symbol">
                  <row.icon size={18} />
                </span>
                <strong>{row.name}</strong>
                <span>
                  {row.summary.total} {ar ? "مهمة مسجلة" : "recorded tasks"}
                </span>
                <small>
                  {row.summary.attention
                    ? `${row.summary.attention} ${ar ? "تحتاج متابعة" : "need attention"}`
                    : ar
                      ? "لا توجد مهام تنتظر المراجعة"
                      : "No tasks awaiting review"}
                </small>
              </Link>
            ))}
        </div>
      </section>
    );
  return (
    <section
      className="agent-directory"
      id="agent-marketplace-grid"
      aria-labelledby="directory-title"
    >
      <div className="directory-section-head">
        <div>
          <span className="eyebrow">
            {ar ? "دليل التخصصات" : "SPECIALTY DIRECTORY"}
          </span>
          <h2 id="directory-title">
            {ar ? "اختر المتخصص المناسب" : "Find your specialist"}
          </h2>
          <p>
            {ar
              ? "قوالب توجه طلبك. النشاط من المهام المحفوظة، وليس حالة تشغيل وكيل مستقل."
              : "Templates that guide requests. Activity comes from saved tasks, not independent live agents."}
          </p>
        </div>
        <span className="directory-total">
          {specialties.length} {ar ? "تخصصات" : "specialties"}
        </span>
      </div>
      <div className="directory-tools">
        <label className="directory-search">
          <Search size={17} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              ar ? "ابحث عن تخصص أو نوع مهمة…" : "Search specialties or tasks…"
            }
            aria-label={ar ? "البحث في التخصصات" : "Search specialties"}
          />
        </label>
        <label className="directory-select">
          <SlidersHorizontal size={16} />
          <select
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
            aria-label={ar ? "تصفية حسب التخصص" : "Filter by specialty"}
          >
            <option value="all">
              {ar ? "كل التخصصات" : "All specialties"}
            </option>
            {specialties.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="directory-filter-row">
        <div
          role="group"
          aria-label={ar ? "تصفية حسب النشاط" : "Filter by activity"}
        >
          {filters.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`filter-pill ${activity === item.id ? "active" : ""}`}
              aria-pressed={activity === item.id}
              onClick={() => setActivity(item.id)}
            >
              {item.name}
              <span>
                {
                  rows.filter((row) =>
                    matchesActivityFilter(row.summary, item.id),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <span role="status">
          {visible.length} {ar ? "نتائج" : "results"}
        </span>
      </div>
      <div className="market-grid directory-grid" aria-live="polite">
        {visible.map((row) => (
          <article
            className="panel agent-card directory-card"
            key={row.id}
            data-testid={`agent-card-${row.id}`}
          >
            <div className="directory-card-head">
              <span className="agent-symbol">
                <row.icon size={23} />
              </span>
              <span
                className={`directory-state ${row.summary.attention ? "attention" : ""}`}
              >
                <i />
                {row.summary.attention
                  ? ar
                    ? "تحتاج متابعة"
                    : "Needs attention"
                  : row.summary.total
                    ? ar
                      ? "مهام محفوظة"
                      : "Tasks recorded"
                    : ar
                      ? "بدون مهام"
                      : "No tasks"}
              </span>
            </div>
            <h3>{row.name}</h3>
            <p>{row.description}</p>
            <div className="directory-card-metrics">
              <div>
                <strong>{row.summary.total}</strong>
                <span>{ar ? "مهام مسجلة" : "Recorded tasks"}</span>
              </div>
              <div>
                <strong>{row.summary.attention}</strong>
                <span>{ar ? "تحتاج متابعة" : "Need attention"}</span>
              </div>
            </div>
            <div className="directory-approval">
              <div>
                <span>{ar ? "اعتماد الخطوات" : "Step approvals"}</span>
                <strong>
                  {row.summary.approvalPercent === null
                    ? "—"
                    : `${row.summary.approvalPercent}%`}
                </strong>
              </div>
              <div
                className="directory-track"
                role="img"
                aria-label={
                  ar
                    ? `${row.summary.approvedSteps} من ${row.summary.stepCount} خطوة معتمدة`
                    : `${row.summary.approvedSteps} of ${row.summary.stepCount} steps approved`
                }
              >
                <span
                  style={{ width: `${row.summary.approvalPercent ?? 0}%` }}
                />
              </div>
              <small>
                {ar
                  ? "موافقتك على الخطة لا تعني اكتمال التنفيذ."
                  : "Plan approval does not mean execution completed."}
              </small>
            </div>
            <div className="agent-footer">
              <button
                type="button"
                className="button button-quiet button-small"
                aria-expanded={open === row.id}
                aria-controls={`activity-${row.id}`}
                onClick={() => setOpen(open === row.id ? null : row.id)}
              >
                {ar ? "التفاصيل والنشاط" : "Details & activity"}
                <ChevronDown size={14} />
              </button>
              <Link
                href={`/workbench?specialty=${row.id}&focus=request-input`}
                className="button button-primary button-small"
                onClick={() => onSelect(row.id)}
              >
                {ar ? "استخدم الوكيل" : "Use agent"}
                <ArrowLeft size={13} />
              </Link>
            </div>
            <div
              id={`activity-${row.id}`}
              hidden={open !== row.id}
              className="directory-details"
            >
              <span className="agent-tag">{row.tag}</span>
              <h4>{ar ? "آخر المهام المحفوظة" : "Recent saved tasks"}</h4>
              {row.summary.records.length === 0 ? (
                <p>
                  {ar
                    ? "لم تسجل مهام لهذا التخصص بعد."
                    : "No tasks recorded for this specialty yet."}
                </p>
              ) : (
                <ul>
                  {row.summary.records.slice(0, 5).map((task) => (
                    <li key={task.id}>
                      <Link href={`/history/${task.id}?focus=task-plan`}>
                        <strong>{task.title}</strong>
                        <span>
                          {new Date(task.createdAt).toLocaleDateString(
                            ar ? "ar" : "en",
                          )}{" "}
                          ·{" "}
                          {(
                            {
                              review: ar ? "بانتظار المراجعة" : "Needs review",
                              paused: ar ? "موقوفة مؤقتًا" : "Paused",
                              approved: ar ? "خطة معتمدة" : "Plan approved",
                              stopped: ar ? "متوقفة" : "Stopped",
                            } as Record<string, string>
                          )[task.status] || task.status}
                        </span>
                        <ArrowLeft size={14} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>
      {visible.length === 0 && (
        <div className="panel directory-empty">
          <Search size={26} />
          <h3>{ar ? "لا توجد تخصصات مطابقة" : "No matching specialties"}</h3>
          <p>
            {ar
              ? "غيّر البحث أو الفلاتر لعرض نتائج أخرى."
              : "Change your search or filters to see more results."}
          </p>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => {
              setQuery("");
              setSpecialty("all");
              setActivity("all");
            }}
          >
            {ar ? "مسح الفلاتر" : "Clear filters"}
          </button>
        </div>
      )}
    </section>
  );
}
