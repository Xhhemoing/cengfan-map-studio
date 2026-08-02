import { RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./admin.css";

type Visit = {
  id: string;
  occurredAt: string;
  ip: string;
  method: string;
  path: string;
  status: number;
  referer: string;
  userAgent: string;
};

type Analytics = {
  total: number;
  uniqueIps: number;
  paths: Record<string, number>;
  visits: Visit[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
    hour12: false,
  }).format(new Date(value));
}

async function loadAnalytics(): Promise<Analytics> {
  const response = await fetch("/api/admin/visits", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(response.status === 403 ? "此管理页只能从服务器本机访问。" : "无法读取访问记录。");
  }
  return response.json() as Promise<Analytics>;
}

export function Admin() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAnalytics(await loadAnalytics());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取访问记录。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadAnalytics()
      .then((nextAnalytics) => {
        if (active) setAnalytics(nextAnalytics);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "无法读取访问记录。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const paths = useMemo(
    () => Object.entries(analytics?.paths ?? {}).sort(([, left], [, right]) => right - left).slice(0, 6),
    [analytics],
  );

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><p className="admin-kicker"><ShieldCheck size={15} /> 本机管理</p><h1>访问统计</h1><span>蹭饭地图工作室</span></div>
        <button type="button" className="admin-refresh" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? "is-spinning" : ""} /> 刷新</button>
      </header>
      {error ? <section className="admin-message" role="alert">{error}</section> : <>
        <section className="admin-summary" aria-label="访问汇总">
          <div><span>总请求</span><strong>{analytics?.total ?? "-"}</strong></div>
          <div><span>独立 IP</span><strong>{analytics?.uniqueIps ?? "-"}</strong></div>
          <div><span>访问路径</span><strong>{Object.keys(analytics?.paths ?? {}).length}</strong></div>
        </section>
        <section className="admin-content">
          <div className="admin-panel"><h2>热门路径</h2>{paths.length ? <ol>{paths.map(([path, count]) => <li key={path}><code>{path}</code><b>{count}</b></li>)}</ol> : <p>尚无访问记录。</p>}</div>
          <div className="admin-panel admin-visits"><h2>最近访问</h2><div className="admin-table-wrap"><table><thead><tr><th>时间</th><th>IP</th><th>操作</th><th>路径</th><th>状态</th><th>来源 / 浏览器</th></tr></thead><tbody>{analytics?.visits.map((visit) => <tr key={visit.id}><td>{formatDate(visit.occurredAt)}</td><td>{visit.ip}</td><td>{visit.method}</td><td><code>{visit.path}</code></td><td>{visit.status}</td><td title={`${visit.referer}\n${visit.userAgent}`}>{visit.referer || visit.userAgent || "直接访问"}</td></tr>)}</tbody></table></div></div>
        </section>
      </>}
    </main>
  );
}
