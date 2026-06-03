"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Activity, Target, Heart, Battery, Footprints, Eye, TrendingUp, BookOpen, Compass,
} from "lucide-react";

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

function loadReports(): Report[] {
  try {
    const data = localStorage.getItem(REPORTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function cleanText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/[*#_`~-]{2,}/g, "")
    .replace(/^[-*]\s/gm, "")
    .replace(/^#+\s/gm, "")
    .replace(/[{}[\]"]/g, "")
    .trim();
}

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

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

// 将单个要点按"小标题：正文"格式拆分渲染
function renderPoint(text: string): JSX.Element {
  const colonIndex = text.indexOf("：");
  if (colonIndex > 0 && colonIndex < 20) {
    const title = text.slice(0, colonIndex);
    const body = text.slice(colonIndex + 1).trim();
    if (body) {
      return (
        <div className="text-sm text-[#5A544B] leading-relaxed">
          <strong className="font-semibold text-[#3D3A34]">{cleanText(title)}</strong>
          <span className="ml-1">：{cleanText(body)}</span>
        </div>
      );
    }
  }
  return <span className="text-sm text-[#5A544B] leading-relaxed">{cleanText(text)}</span>;
}

function renderCardContent(content: any): JSX.Element | null {
  // 数组 → 要点列表（内层循环：每条要点一行）
  if (Array.isArray(content)) {
    const items = content.filter(
      (item: any) => typeof item === "string" && item.trim()
    );
    if (items.length === 0) return null;
    return (
      <ul className="space-y-3">
        {items.map((item: string, i: number) => (
          <li
            key={i}
            className="flex items-start gap-2.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#8FAE8B] mt-[9px] shrink-0" />
            <div className="flex-1 min-w-0">{renderPoint(item)}</div>
          </li>
        ))}
      </ul>
    );
  }

  // 字符串（旧数据兼容）
  const text = typeof content === "string" ? content : "";
  if (!text.trim()) return null;
  return (
    <p className="text-sm text-[#5A544B] leading-relaxed whitespace-pre-wrap">
      {cleanText(text)}
    </p>
  );
}

function renderReportCards(rawData: any): JSX.Element[] | null {
  // 容错：如果 rawData 是字符串，先尝试解析为对象
  let data = rawData;
  if (typeof rawData === "string") {
    try {
      data = JSON.parse(rawData);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  // 容错：如果只有"整体状态概览"有内容且内容是 JSON 字符串，拆解到各字段
  const singleField = Object.keys(data).find(
    (k) =>
      typeof data[k] === "string" &&
      data[k].trim().startsWith("{") &&
      data[k].trim().endsWith("}")
  );
  if (singleField) {
    try {
      const parsed = JSON.parse(data[singleField].trim());
      if (typeof parsed === "object" && !Array.isArray(parsed)) {
        data = { ...data, ...parsed };
      }
    } catch {}
  }

  const cards: JSX.Element[] = [];

  // 外层循环：每个字段一张独立卡片
  for (const [key, label] of Object.entries(REPORT_LABELS)) {
    const content = data[key];
    if (content == null) continue;
    if (typeof content === "string" && content.trim() === "") continue;
    if (Array.isArray(content) && content.length === 0) continue;

    const rendered = renderCardContent(content);
    if (!rendered) continue;

    const Icon = REPORT_ICONS[key];
    cards.push(
      <div key={key} className="card bg-white rounded-2xl border border-[#E2DDD2] p-6">
        <h3 className="text-xs font-medium text-[#7A746B] mb-3 tracking-wide uppercase flex items-center gap-1.5">
          {Icon ? <Icon className="text-[#8FAE8B]" size={14} /> : null}
          {label}
        </h3>
        {rendered}
      </div>
    );
  }

  return cards.length > 0 ? cards : null;
}

export default function ReportDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [report, setReport] = useState<Report | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const reports = loadReports();
    const found = reports.find((r) => r.id === id);
    if (found) {
      setReport(found);
      document.title = found.title;
      console.log("=== 诊断 report.data ===");
      console.log("typeof:", typeof found.data);
      console.log("isArray:", Array.isArray(found.data));
      console.log("value:", found.data);
      if (typeof found.data === "string") {
        console.log("是字符串，尝试 JSON.parse…");
        try { console.log("parsed:", JSON.parse(found.data)); } catch (e) { console.log("parse 失败:", e); }
      }
      if (typeof found.data === "object" && found.data) {
        console.log("keys:", Object.keys(found.data));
        for (const k of Object.keys(found.data)) {
          console.log(`data[${k}] 类型:`, typeof found.data[k], "值:", found.data[k]);
        }
      }
    } else {
      setNotFound(true);
    }
    return () => { document.title = "长期自我观察"; };
  }, [id]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#FAF8F3]">
        <main className="max-w-2xl mx-auto px-6 py-12">
          <div className="mb-10">
            <Link
              href="/reports"
              className="text-sm text-[#7A746B] hover:text-[#5A544B] transition-colors"
            >
              ← 返回报告列表
            </Link>
          </div>
          <div className="bg-white rounded-2xl border border-[#E2DDD2] p-10 text-center">
            <p className="text-sm text-[#7A746B]">报告未找到</p>
          </div>
        </main>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-[#FAF8F3]">
        <main className="max-w-2xl mx-auto px-6 py-12">
          <div className="text-sm text-[#7A746B]">加载中…</div>
        </main>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#FAF8F3]">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #FAF8F3 !important; }
          .card { break-inside: avoid; border: 1px solid #E2DDD2 !important; box-shadow: none !important; }
        }
      `}</style>
      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* 顶部导航 */}
        <div className="no-print mb-10">
          <Link
            href="/reports"
            className="text-sm text-[#7A746B] hover:text-[#5A544B] transition-colors"
          >
            ← 返回报告列表
          </Link>
        </div>

        {/* 标题区 */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-medium text-[#3D3A34] tracking-tight">
            {report.title}
          </h1>
          <p className="mt-2 text-sm text-[#7A746B]">
            生成于{formatLabel(report.generatedAt)}
          </p>
          <button
            onClick={handlePrint}
            className="no-print mt-4 px-5 py-2 bg-[#A8C3A4] text-[#FAF8F3] rounded-xl text-sm font-medium hover:bg-[#8FAE8B] transition-colors"
          >
            导出 PDF
          </button>
        </div>

        {/* 报告正文卡片 */}
        <div className="space-y-4" id="report-content">
          {report.data ? renderReportCards(report.data) : (
            <div className="bg-white rounded-2xl border border-[#E2DDD2] p-10 text-center">
              <p className="text-sm text-[#7A746B]">报告内容暂不可用</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
