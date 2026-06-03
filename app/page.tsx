"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Activity, Target, Heart, Battery, Footprints, Eye, TrendingUp, BookOpen, Compass,
} from "lucide-react";

interface Record {
  id: string;
  date: string;
  whatHappened: string;
  emotion: string;
  drain: string;
  restore: string;
  moment: string;
  mode: string;
  observation: string;
  needNow: string;
  feedbackText?: string;
  clarification?: string;
  revisedFeedback?: string;
}

// 清洗文本中的 markdown 符号
function cleanText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/[*#_`~-]{2,}/g, "")
    .replace(/^[-*]\s/gm, "")
    .replace(/^#+\s/gm, "")
    .trim();
}

// 从文本中提取 JSON 对象
function extractJSON(text: string): Record<string, any> | null {
  let cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

// 阶段报告字段映射
const REPORT_LABELS: Record<string, string> = {
  "整体状态概览": "整体状态概览",
  "关注主题": "本阶段最突出的关注主题",
  "情绪与焦虑模式": "情绪与焦虑模式",
  "消耗与恢复模式": "消耗与恢复模式",
  "行动风格与卡点": "行动风格与卡点",
  "性格特质观察": "性格特质观察",
  "成长阶段判断": "成长阶段判断",
  "长期理解更新": "对用户的长期理解更新",
  "下阶段建议": "下阶段建议",
};

const REPORT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "整体状态概览": Activity,
  "关注主题": Target,
  "情绪与焦虑模式": Heart,
  "消耗与恢复模式": Battery,
  "行动风格与卡点": Footprints,
  "性格特质观察": Eye,
  "成长阶段判断": TrendingUp,
  "长期理解更新": BookOpen,
  "下阶段建议": Compass,
};

// 渲染卡片内容：将字段文本渲染为段落
function renderCardText(content: string) {
  const text = typeof content === "string" ? content : "";
  if (!text.trim()) return null;
  return (
    <p className="text-sm text-[#5A544B] leading-relaxed whitespace-pre-wrap">
      {cleanText(text)}
    </p>
  );
}

// 渲染报告为卡片
function renderReportCards(data: Record<string, any>) {
  const items = Object.entries(REPORT_LABELS);
  const cards: JSX.Element[] = [];
  for (const [key, label] of items) {
    const content = data[key];
    if (!content || (typeof content === "string" && content.trim() === "")) continue;
    const rendered = renderCardText(content);
    if (!rendered) continue;
    const Icon = REPORT_ICONS[key];
    cards.push(
      <div key={key} className="bg-white rounded-2xl border border-[#E2DDD2] p-6">
        <h3 className="text-xs font-medium text-[#7A746B] mb-3 tracking-wide uppercase flex items-center gap-1.5">
          {Icon ? <Icon className="text-[#8FAE8B]" size={14} /> : null}
          {label}
        </h3>
        {rendered}
      </div>
    );
  }
  return cards;
}

export default function Home() {
  const [records, setRecords] = useState<Record[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState<Record<string, any> | null>(null);
  const [reportError, setReportError] = useState("");
  const reportEndRef = useRef<HTMLDivElement>(null);

  const loadRecords = () => {
    const data = localStorage.getItem("self-observation-records");
    if (data) {
      try {
        let parsed: Record[] = JSON.parse(data);
        // 迁移旧数据：consume → drain/restore
        let changed = false;
        parsed = parsed.map((r: any) => {
          if (r.consume && !r.drain) {
            r.drain = r.consume;
            changed = true;
          }
          if (!r.restore) r.restore = "";
          if (!r.needNow) r.needNow = "";
          return r;
        });
        if (changed) {
          localStorage.setItem("self-observation-records", JSON.stringify(parsed));
        }
        parsed.sort((a, b) => b.date.localeCompare(a.date));
        setRecords(parsed);
      } catch {}
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  useEffect(() => {
    reportEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [reportData]);

  const preview = (text: string) => {
    if (!text) return "";
    return text.replace(/\n/g, " ").slice(0, 80) + (text.length > 80 ? "……" : "");
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("确定删除这条记录吗？")) return;
    const data = localStorage.getItem("self-observation-records");
    if (data) {
      const parsed: Record[] = JSON.parse(data);
      const filtered = parsed.filter((r) => r.id !== id);
      localStorage.setItem("self-observation-records", JSON.stringify(filtered));
      loadRecords();
      if (expandedId === id) setExpandedId(null);
    }
  };

  const handleGenerateReport = async () => {
    const allRecords: Record[] = (() => {
      const data = localStorage.getItem("self-observation-records");
      return data ? JSON.parse(data) : [];
    })();

    if (allRecords.length < 5) {
      const ok = window.confirm(
        `目前记录还较少（${allRecords.length} 条），现在生成的报告可能不够准确，建议积累更多记录。是否仍要生成？`
      );
      if (!ok) return;
    }

    setGenerating(true);
    setReportData(null);
    setReportError("");

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: allRecords }),
      });
      if (!res.ok) throw new Error("服务器返回错误：" + res.status);

      const json = await res.json();
      const data = json.data || json;
      setReportData(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      setReportError("生成失败：" + msg + "，请稍后重试。");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F3]">
      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* 标题区 */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-medium text-[#3D3A34] tracking-tight">
            长期自我观察
          </h1>
          <p className="mt-2 text-sm text-[#7A746B]">
            {records.length > 0
              ? `共 ${records.length} 条记录`
              : "开始记录你的每一天"}
          </p>
        </div>

        {/* 操作区 */}
        <div className="flex flex-col gap-3">
          <Link
            href="/record"
            className="w-full text-center px-6 py-3.5 bg-[#A8C3A4] text-[#FAF8F3] rounded-xl text-sm font-medium hover:bg-[#8FAE8B] transition-colors"
          >
            + 今日记录
          </Link>
          <button
            onClick={handleGenerateReport}
            disabled={generating}
            className="w-full px-6 py-3 bg-[#D9C2A3] text-[#FAF8F3] rounded-xl text-sm font-medium hover:bg-[#CBB596] transition-colors disabled:opacity-40"
          >
            {generating ? "正在回顾你的全部记录……" : "生成阶段报告"}
          </button>
        </div>

        {/* 阶段报告 */}
        {(reportData || reportError) && (
          <section className="mt-12">
            <h2 className="text-sm font-medium text-[#7A746B] mb-4 flex items-center gap-2">
              <span className="w-0.5 h-4 bg-[#D1CBC0] rounded-full" />
              阶段报告
            </h2>
            <div className="space-y-4">
              {reportError ? (
                <div className="bg-white rounded-2xl border border-[#E2DDD2] p-6">
                  <p className="text-sm text-[#5A544B]">{reportError}</p>
                </div>
              ) : reportData ? (
                renderReportCards(reportData)
              ) : null}
              <div ref={reportEndRef} />
            </div>
          </section>
        )}

        {/* 历史记录 */}
        <section className="mt-12">
          <h2 className="text-sm font-medium text-[#7A746B] mb-4 flex items-center gap-2">
            <span className="w-0.5 h-4 bg-[#D1CBC0] rounded-full" />
            历史记录
          </h2>

          {records.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-[0_1px_4px_0_rgba(0,0,0,0.04)] border border-[#E2DDD2] p-10 text-center">
              <p className="text-sm text-[#7A746B]">还没有记录，点击上方按钮开始。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((r) => (
                <div
                  key={r.id}
                  className="bg-white rounded-2xl shadow-[0_1px_4px_0_rgba(0,0,0,0.04)] border border-[#E2DDD2] overflow-hidden"
                >
                  <button
                    className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-[#FCFAF5] transition-colors"
                    onClick={() =>
                      setExpandedId(expandedId === r.id ? null : r.id)
                    }
                  >
                    <span className="text-xs text-[#FAF8F3] bg-[#D9C2A3] px-2.5 py-1 rounded-lg shrink-0">
                      {r.date}
                    </span>
                    <span className="text-sm text-[#5A544B] truncate flex-1">
                      {preview(r.whatHappened || r.emotion || r.observation || r.drain || "")}
                    </span>
                    <span className="text-xs text-[#7A746B] shrink-0">
                      {expandedId === r.id ? "收起" : "展开"}
                    </span>
                  </button>

                  {expandedId === r.id && (
                    <div className="px-5 pb-5 border-t border-[#F5F1E8]">
                      <div className="pt-4 text-sm text-[#5A544B] space-y-3">
                        {r.whatHappened && (
                          <div>
                            <p className="text-xs font-medium text-[#7A746B] mb-1">今天发生了什么</p>
                            <p className="whitespace-pre-wrap leading-relaxed">{r.whatHappened}</p>
                          </div>
                        )}
                        {r.emotion && (
                          <div>
                            <p className="text-xs font-medium text-[#7A746B] mb-1">情绪/状态</p>
                            <p className="whitespace-pre-wrap">{r.emotion}</p>
                          </div>
                        )}
                        {r.drain && (
                          <div>
                            <p className="text-xs font-medium text-[#7A746B] mb-1">今天什么最消耗我</p>
                            <p className="whitespace-pre-wrap">{r.drain}</p>
                          </div>
                        )}
                        {r.restore && (
                          <div>
                            <p className="text-xs font-medium text-[#7A746B] mb-1">今天什么又恢复了我</p>
                            <p className="whitespace-pre-wrap">{r.restore}</p>
                          </div>
                        )}
                        {r.moment && (
                          <div>
                            <p className="text-xs font-medium text-[#7A746B] mb-1">反复在意的瞬间</p>
                            <p className="whitespace-pre-wrap">{r.moment}</p>
                          </div>
                        )}
                        {r.mode && (
                          <div>
                            <p className="text-xs font-medium text-[#7A746B] mb-1">今天我更像</p>
                            <p>{r.mode}</p>
                          </div>
                        )}
                        {r.observation && (
                          <div>
                            <p className="text-xs font-medium text-[#7A746B] mb-1">小观察</p>
                            <p className="whitespace-pre-wrap">{r.observation}</p>
                          </div>
                        )}
                        {r.needNow && (
                          <div>
                            <p className="text-xs font-medium text-[#7A746B] mb-1">现在最需要</p>
                            <p className="whitespace-pre-wrap">{r.needNow}</p>
                          </div>
                        )}

                        {/* AI 反馈摘要 */}
                        {r.feedbackText && (
                          <div className="bg-[#F5F1E8] rounded-xl p-4 -mx-1">
                            <p className="text-xs font-medium text-[#7A746B] mb-2">
                              AI 反馈
                            </p>
                            <p className="text-sm text-[#5A544B] leading-relaxed line-clamp-3">
                              {(() => {
                                try {
                                  const start = r.feedbackText.indexOf("{");
                                  const end = r.feedbackText.lastIndexOf("}");
                                  if (start !== -1 && end > start) {
                                    const json = JSON.parse(r.feedbackText.slice(start, end + 1));
                                    return json["关键信号"] || json["情绪与需求"] || "";
                                  }
                                } catch {}
                                return r.feedbackText.replace(/\d+\.\s+/g, "").slice(0, 200);
                              })()}
                            </p>
                          </div>
                        )}
                        {r.clarification && (
                          <div className="bg-[#F5F1E8] rounded-xl p-4 -mx-1">
                            <p className="text-xs font-medium text-[#7A746B] mb-1">
                              你的回应
                            </p>
                            <p className="text-sm text-[#5A544B]">{r.clarification}</p>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#F5F1E8] flex items-center gap-4">
                        <Link
                          href={`/record?id=${r.id}`}
                          className="text-xs text-[#7A746B] hover:text-[#3D3A34] transition-colors"
                        >
                          编辑
                        </Link>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="text-xs text-[#7A746B] hover:text-[#c4846a] transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-16 text-xs text-[#9E988E] text-center leading-relaxed">
          本工具为个人自我观察辅助，非心理咨询或诊断。<br />
          数据仅保存在你的浏览器本地。
        </footer>
      </main>
    </div>
  );
}
