"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";

interface Record {
  id: string;
  date: string;
  [key: string]: any;
}

interface Report {
  id: string;
  title: string;
  generatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  data: Record<string, any> | null;
  error?: string;
}

const REPORTS_KEY = "self-observation-reports";
const RECORDS_KEY = "self-observation-records";

function loadReports(): Report[] {
  try {
    const data = localStorage.getItem(REPORTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function loadRecords(): Record[] {
  try {
    const data = localStorage.getItem(RECORDS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function buildTitle(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sm = s.getMonth() + 1;
  const sd = s.getDate();
  const em = e.getMonth() + 1;
  const ed = e.getDate();
  return sm === em
    ? `${sm}月${sd}日-${ed}日阶段报告`
    : `${sm}月${sd}日-${em}月${ed}日阶段报告`;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [validationError, setValidationError] = useState("");
  const [generating, setGenerating] = useState(false);
  const mountedRef = useRef(true);
  const generatingRef = useRef(false);

  // 加载报告列表
  const refresh = () => {
    const all = loadReports();
    all.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    setReports(all);
  };

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 轮询：有生成中的条目时定期刷新
  useEffect(() => {
    const hasGenerating = reports.some(
      (r) => r.data === null && !r.error
    );
    if (!hasGenerating) return;

    const timer = setInterval(() => {
      const all = loadReports();
      all.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
      if (mountedRef.current) setReports(all);
      const stillGenerating = all.some(
        (r) => r.data === null && !r.error
      );
      if (!stillGenerating) clearInterval(timer);
    }, 2000);

    return () => clearInterval(timer);
  }, [reports]);

  // 全选
  const handleSelectAll = () => {
    const records = loadRecords();
    if (records.length === 0) {
      setValidationError("当前没有任何记录，无法生成报告");
      return;
    }
    const sorted = [...records].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    setStartDate(sorted[0].date);
    setEndDate(sorted[sorted.length - 1].date);
    setValidationError("");
  };

  // 校验
  const validate = (): string | null => {
    if (!startDate || !endDate) return "请选择开始和结束日期";
    if (endDate < startDate) return "结束日期不能早于开始日期";
    const today = todayStr();
    if (startDate > today) return "开始日期不能晚于今天";
    if (endDate > today) return "结束日期不能晚于今天";

    const allRecords = loadRecords();
    const count = allRecords.filter(
      (r) => r.date >= startDate && r.date <= endDate
    ).length;
    if (count === 0) return "该时间段内没有记录，无法生成报告";
    return null;
  };

  // 生成
  const handleGenerate = async () => {
    setValidationError("");
    const err = validate();
    if (err) {
      setValidationError(err);
      return;
    }

    const allRecords = loadRecords();
    const filtered = allRecords.filter(
      (r) => r.date >= startDate && r.date <= endDate
    );
    if (filtered.length === 0) {
      setValidationError("该时间段内没有记录，无法生成报告");
      return;
    }

    const title = buildTitle(startDate, endDate);
    const now = todayStr();
    const reportId =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    const newReport: Report = {
      id: reportId,
      title,
      generatedAt: now,
      rangeStart: startDate,
      rangeEnd: endDate,
      data: null,
    };

    // 先存入 localStorage，立即显示"生成中"条目
    const current = loadReports();
    current.unshift(newReport);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(current));
    refresh();
    setShowPicker(false);
    setGenerating(true);
    generatingRef.current = true;

    // 异步生成（非阻塞）
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: filtered }),
      });

      if (!res.ok) throw new Error("服务器返回错误：" + res.status);

      const json = await res.json();
      const reportData = json.data || json;

      const updated = loadReports().map((r) =>
        r.id === reportId ? { ...r, data: reportData } : r
      );
      localStorage.setItem(REPORTS_KEY, JSON.stringify(updated));
      if (mountedRef.current) refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      const updated = loadReports().map((r) =>
        r.id === reportId ? { ...r, error: msg } : r
      );
      localStorage.setItem(REPORTS_KEY, JSON.stringify(updated));
      if (mountedRef.current) refresh();
    } finally {
      generatingRef.current = false;
      if (mountedRef.current) setGenerating(false);
    }
  };

  // 重试
  const handleRetry = async (report: Report) => {
    const allRecords = loadRecords();
    const filtered = allRecords.filter(
      (r) =>
        r.date >= report.rangeStart && r.date <= report.rangeEnd
    );
    if (filtered.length === 0) {
      const updated = loadReports().map((r) =>
        r.id === report.id
          ? { ...r, error: "该时间段内记录已被删除，无法重新生成" }
          : r
      );
      localStorage.setItem(REPORTS_KEY, JSON.stringify(updated));
      refresh();
      return;
    }

    // 更新为生成中
    const pending = loadReports().map((r) =>
      r.id === report.id
        ? { ...r, data: null, error: undefined }
        : r
    );
    localStorage.setItem(REPORTS_KEY, JSON.stringify(pending));
    refresh();
    setGenerating(true);
    generatingRef.current = true;

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: filtered }),
      });

      if (!res.ok) throw new Error("服务器返回错误：" + res.status);

      const json = await res.json();
      const reportData = json.data || json;

      const updated = loadReports().map((r) =>
        r.id === report.id ? { ...r, data: reportData } : r
      );
      localStorage.setItem(REPORTS_KEY, JSON.stringify(updated));
      if (mountedRef.current) refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      const updated = loadReports().map((r) =>
        r.id === report.id
          ? { ...r, error: msg, data: null }
          : r
      );
      localStorage.setItem(REPORTS_KEY, JSON.stringify(updated));
      if (mountedRef.current) refresh();
    } finally {
      generatingRef.current = false;
      if (mountedRef.current) setGenerating(false);
    }
  };

  const hasGenerating = reports.some(
    (r) => r.data === null && !r.error
  );

  const handleDelete = (id: string) => {
    if (!window.confirm("确定删除这份报告吗？")) return;
    const updated = loadReports().filter((r) => r.id !== id);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(updated));
    refresh();
  };

  return (
    <div className="min-h-screen bg-[#FAF8F3]">
      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* 顶部导航 */}
        <div className="mb-10">
          <Link
            href="/"
            className="text-sm text-[#7A746B] hover:text-[#5A544B] transition-colors"
          >
            ← 返回首页
          </Link>
        </div>

        {/* 标题区 */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-medium text-[#3D3A34] tracking-tight">
            阶段报告
          </h1>
          <p className="mt-2 text-sm text-[#7A746B]">
            基于你的全部记录生成的阶段性回顾
          </p>
        </div>

        {/* 生成按钮 */}
        <button
          onClick={() => {
            setShowPicker(!showPicker);
            setValidationError("");
          }}
          disabled={hasGenerating}
          className="w-full px-6 py-3 bg-[#D9C2A3] text-[#FAF8F3] rounded-xl text-sm font-medium hover:bg-[#CBB596] transition-colors disabled:opacity-40"
        >
          {showPicker ? "取消" : "生成阶段报告"}
        </button>

        {/* 时间范围选择器 */}
        {showPicker && (
          <div className="mt-4 bg-white rounded-2xl border border-[#E2DDD2] p-6 space-y-4">
            <h3 className="text-sm font-medium text-[#3D3A34]">
              选择时间范围
            </h3>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-[#7A746B] block mb-1">
                  开始日期
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setValidationError("");
                  }}
                  max={todayStr()}
                  className="w-full px-3 py-2 border border-[#E2DDD2] rounded-lg text-sm text-[#3D3A34] bg-[#FCFAF5] focus:outline-none focus:border-[#A8C3A4] transition-colors"
                />
              </div>
              <span className="text-[#9E988E] mt-5">—</span>
              <div className="flex-1">
                <label className="text-xs text-[#7A746B] block mb-1">
                  结束日期
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setValidationError("");
                  }}
                  max={todayStr()}
                  className="w-full px-3 py-2 border border-[#E2DDD2] rounded-lg text-sm text-[#3D3A34] bg-[#FCFAF5] focus:outline-none focus:border-[#A8C3A4] transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectAll}
                className="flex-1 px-4 py-2.5 bg-[#E6F0E4] text-[#6B8F67] rounded-xl text-sm font-medium border border-[#C8DDC4] hover:bg-[#D8E8D4] transition-colors"
              >
                选中全部记录
              </button>
              <button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setValidationError("");
                }}
                className="flex-1 px-4 py-2.5 border border-[#E2DDD2] text-[#7A746B] rounded-xl text-sm font-medium hover:bg-[#F5F1E8] transition-colors"
              >
                清除日期
              </button>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full px-6 py-3 bg-[#A8C3A4] text-[#FAF8F3] rounded-xl text-sm font-medium hover:bg-[#8FAE8B] transition-colors disabled:opacity-40"
            >
              {generating ? "生成中……" : "确认生成"}
            </button>

            {validationError && (
              <p className="text-xs text-[#c4846a]">{validationError}</p>
            )}
          </div>
        )}

        {/* 报告列表 */}
        <section className="mt-10">
          {reports.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-[0_1px_4px_0_rgba(0,0,0,0.04)] border border-[#E2DDD2] p-10 text-center">
              <p className="text-sm text-[#7A746B]">
                当前暂未生成阶段报告
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="bg-white rounded-2xl shadow-[0_1px_4px_0_rgba(0,0,0,0.04)] border border-[#E2DDD2] overflow-hidden"
                >
                  {r.data === null && !r.error ? (
                    /* 生成中状态 */
                    <div className="flex items-center">
                      <div className="flex-1 px-5 py-4 opacity-50">
                        <p className="text-sm text-[#5A544B]">
                          报告生成中，请稍候…
                        </p>
                        <p className="text-xs text-[#9E988E] mt-1">
                          生成期间可浏览其他页面，请勿关闭网页
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="px-4 text-[#9E988E] hover:text-[#c4846a] transition-colors shrink-0"
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : r.error ? (
                    /* 失败状态 */
                    <div className="flex items-center">
                      <div className="flex-1 px-5 py-4">
                        <p className="text-sm text-[#5A544B]">
                          {r.title}
                        </p>
                        <p className="text-xs text-[#c4846a] mt-1">
                          生成失败（{r.error}）
                        </p>
                        <button
                          onClick={() => handleRetry(r)}
                          disabled={generating}
                          className="mt-2 text-xs text-[#8FAE8B] hover:text-[#7A9E76] transition-colors font-medium disabled:opacity-40"
                        >
                          重试
                        </button>
                      </div>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="px-4 text-[#9E988E] hover:text-[#c4846a] transition-colors shrink-0"
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : (
                    /* 正常状态 */
                    <div className="flex items-center">
                      <Link
                        href={`/reports/${r.id}`}
                        className="flex-1 px-5 py-4 hover:bg-[#FCFAF5] transition-colors"
                      >
                        <p className="text-sm text-[#5A544B]">
                          {r.title}
                        </p>
                        <p className="text-xs text-[#9E988E] mt-1">
                          生成于{formatLabel(r.generatedAt)}
                        </p>
                      </Link>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="no-print px-4 text-[#9E988E] hover:text-[#c4846a] transition-colors"
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
