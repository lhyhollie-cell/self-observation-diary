"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Radar, HeartPulse, Footprints, Battery, Eye, ArrowRight, MessageCircle,
} from "lucide-react";

interface Record {
  id: string;
  createdAt: string;
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
  summary?: string;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 清洗文本中的 markdown 符号和残留引号括号
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

// 从文本中提取 JSON 对象
function extractJSON(text: string): Record<string, any> | null {
  // 去掉 ```json ... ``` 包裹
  let cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  // 找到第一个 { 和最后一个 }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

// 卡片字段标题映射
const CARD_LABELS: Record<string, string> = {
  "关键信号": "本次记录的关键信号",
  "情绪与需求": "情绪与需求",
  "行动与卡点": "行动与卡点",
  "充电与消耗": "充电与消耗",
  "长期观察信号": "长期观察信号",
  "下一步小行动": "一个最轻量的下一步行动",
};

const CARD_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "关键信号": Radar,
  "情绪与需求": HeartPulse,
  "行动与卡点": Footprints,
  "充电与消耗": Battery,
  "长期观察信号": Eye,
  "下一步小行动": ArrowRight,
};

// 将单个要点按"小标题：正文"格式拆分渲染
function renderPoint(text: string): JSX.Element {
  const colonIndex = text.indexOf("：");
  if (colonIndex > 0 && colonIndex < 20) {
    const title = text.slice(0, colonIndex);
    const body = text.slice(colonIndex + 1).trim();
    if (body) {
      return (
        <div className="text-sm text-[var(--text-body)] leading-relaxed">
          <strong className="font-semibold text-[var(--text-heading)]">{cleanText(title)}</strong>
          <span className="ml-1">：{cleanText(body)}</span>
        </div>
      );
    }
  }
  return <span className="text-sm text-[var(--text-body)] leading-relaxed">{cleanText(text)}</span>;
}

// 渲染单张卡片正文：数组→分点列表，字符串→段落
function renderCardContent(content: any): JSX.Element | null {
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
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] mt-[9px] shrink-0" />
            <div className="flex-1 min-w-0">{renderPoint(item)}</div>
          </li>
        ))}
      </ul>
    );
  }

  const text = typeof content === "string" ? content : "";
  if (!text.trim()) return null;
  return (
    <p className="text-sm text-[var(--text-body)] leading-relaxed whitespace-pre-wrap">
      {cleanText(text)}
    </p>
  );
}

// 渲染 JSON 反馈为多卡片
function renderFeedbackCards(data: Record<string, any>) {
  const cards: JSX.Element[] = [];

  // 常规卡片（外层循环：每个字段一张独立卡片）
  for (const [key, label] of Object.entries(CARD_LABELS)) {
    const content = data[key];
    if (content == null) continue;
    if (typeof content === "string" && content.trim() === "") continue;
    if (Array.isArray(content) && content.length === 0) continue;
    const rendered = renderCardContent(content);
    if (!rendered) continue;
    const Icon = CARD_ICONS[key];
    cards.push(
      <div key={key} className="card-mist p-6">
        <h3 className="text-xs font-medium text-[var(--text-label)] mb-3 tracking-wide uppercase flex items-center gap-1.5">
          {Icon ? <Icon className="text-[var(--color-accent)]" size={14} /> : null}
          {label}
        </h3>
        {rendered}
      </div>
    );
  }

  // 追问特殊处理
  const questions = data["追问"];
  if (questions && Array.isArray(questions) && questions.length > 0) {
    cards.push(
      <div key="追问" className="bg-[var(--tag-bg)] rounded-2xl border border-[var(--card-border)] p-6">
        <h3 className="text-xs font-medium text-[var(--text-label)] mb-3 tracking-wide uppercase flex items-center gap-1.5">
          <MessageCircle className="text-[var(--color-accent)]" size={14} />
          想继续追问你的
        </h3>
        <ul className="space-y-2">
          {questions.map((q: string, i: number) => (
            <li key={i} className="text-sm text-[var(--text-body)] leading-relaxed flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] mt-2 shrink-0" />
              <span>{cleanText(q)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return cards;
}

export default function RecordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [date, setDate] = useState(todayStr);
  const [whatHappened, setWhatHappened] = useState("");
  const [emotion, setEmotion] = useState("");
  const [drain, setDrain] = useState("");
  const [restore, setRestore] = useState("");
  const [moment, setMoment] = useState("");
  const [mode, setMode] = useState("");
  const [observation, setObservation] = useState("");
  const [needNow, setNeedNow] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // AI 反馈
  const [feedbacking, setFeedbacking] = useState(false);
  const [feedbackData, setFeedbackData] = useState<Record<string, any> | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const feedbackEndRef = useRef<HTMLDivElement>(null);

  // 旧反馈（编辑模式）
  const [oldFeedback, setOldFeedback] = useState("");

  // 追问
  const [clarification, setClarification] = useState("");
  const [clarifying, setClarifying] = useState(false);
  const [clarified, setClarified] = useState(false);
  const [revisedText, setRevisedText] = useState("");

  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [hasRegenerated, setHasRegenerated] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  // 判断当前记录是否已被回应过（localStorage 中有 clarification）
  const hasExistingClarification = (): boolean => {
    const id = editId || lastSavedId;
    if (!id) return false;
    try {
      const data = localStorage.getItem("self-observation-records");
      if (!data) return false;
      const records: Record[] = JSON.parse(data);
      const r = records.find((x) => x.id === id);
      return !!(r && r.clarification);
    } catch {
      return false;
    }
  };

  // 判断当前记录是否有 AI 分析
  const hasExistingAnalysis = (): boolean => {
    const id = editId || lastSavedId;
    if (!id) return false;
    try {
      const data = localStorage.getItem("self-observation-records");
      if (!data) return false;
      const records: Record[] = JSON.parse(data);
      const r = records.find((x) => x.id === id);
      return !!(r && r.feedbackText);
    } catch {
      return false;
    }
  };

  // 编辑模式：加载记录
  useEffect(() => {
    if (editId) {
      const data = localStorage.getItem("self-observation-records");
      if (data) {
        const raw: any[] = JSON.parse(data);
        // 迁移旧数据
        let changed = false;
        const migrated = raw.map((r: any) => {
          if (r.consume && !r.drain) { r.drain = r.consume; changed = true; }
          if (!r.restore) r.restore = "";
          if (!r.needNow) r.needNow = "";
          return r;
        });
        if (changed) {
          localStorage.setItem("self-observation-records", JSON.stringify(migrated));
        }
        const r = migrated.find((r: any) => r.id === editId);
        if (r) {
          setDate(r.date);
          setWhatHappened(r.whatHappened);
          setEmotion(r.emotion);
          setDrain(r.drain || "");
          setRestore(r.restore || "");
          setMoment(r.moment);
          setMode(r.mode);
          setObservation(r.observation);
          setNeedNow(r.needNow || "");
          if (r.feedbackText) {
            setOldFeedback(r.feedbackText);
            setFeedbackText(r.feedbackText);
            setShowFeedback(true);
            const parsed = extractJSON(r.feedbackText);
            if (parsed) setFeedbackData(parsed);
          }
          if (r.clarification) {
            setClarification(r.clarification);
            setClarified(true);
          }
          if (r.revisedFeedback) {
            setRevisedText(r.revisedFeedback);
          }
          setLastSavedId(editId);
        }
      }
    }
  }, [editId]);

  // 自动滚动
  useEffect(() => {
    feedbackEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feedbackText, revisedText]);

  const doSaveAndRegenerate = async () => {
    setSaving(true);
    setErrorMsg("");

    const record: Record = {
      id: editId || generateId(),
      createdAt: new Date().toISOString(),
      date,
      whatHappened: whatHappened.trim(),
      emotion: emotion.trim(),
      drain: drain.trim(),
      restore: restore.trim(),
      moment: moment.trim(),
      mode: mode.trim(),
      observation: observation.trim(),
      needNow: needNow.trim(),
    };

    const existing = localStorage.getItem("self-observation-records");
    let records: Record[] = existing ? JSON.parse(existing) : [];

    if (editId) {
      // 编辑模式：清空旧 AI 数据，重新生成
      record.feedbackText = undefined;
      record.clarification = undefined;
      record.revisedFeedback = undefined;
      const idx = records.findIndex((r) => r.id === editId);
      if (idx !== -1) {
        records[idx] = { ...records[idx], ...record };
      }
    } else {
      records.push(record);
    }
    localStorage.setItem("self-observation-records", JSON.stringify(records));

    setLastSavedId(record.id);

    if (editId) {
      setShowFeedback(true);
      setSaving(false);
      await regenerateFeedback(record, records);
    } else {
      setSaving(false);
      setShowFeedback(true);
      await generateFeedback(record, records.slice(0, -1));
    }
  };

  const handleSave = () => {
    if (saving) return;
    setErrorMsg("");

    if (!whatHappened.trim()) {
      setErrorMsg("请填写「今天发生了什么？」");
      return;
    }

    // 编辑已有 AI 分析的记录时，弹确认框
    if (editId && hasExistingAnalysis()) {
      setShowOverwriteConfirm(true);
      return;
    }

    doSaveAndRegenerate();
  };

  const handleConfirmOverwrite = () => {
    setShowOverwriteConfirm(false);
    // 立即清除界面上旧的 AI 内容
    setFeedbackData(null);
    setFeedbackText("");
    setOldFeedback("");
    setClarification("");
    setRevisedText("");
    setClarified(false);
    setHasRegenerated(false);
    // 执行保存 + 重新生成
    doSaveAndRegenerate();
  };

  const generateFeedback = async (today: Record, history: Record[]) => {
    setFeedbacking(true);
    setFeedbackData(null);
    setFeedbackText("");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, today }),
      });
      if (!res.ok) throw new Error("服务器返回错误：" + res.status);

      const json = await res.json();
      const data = json.data || json;

      setFeedbackData(data);
      const jsonStr = JSON.stringify(data);
      setFeedbackText(jsonStr);

      // 保存到记录
      if (today.id) {
        const store = localStorage.getItem("self-observation-records");
        if (store) {
          const all: Record[] = JSON.parse(store);
          const idx = all.findIndex((r) => r.id === today.id);
          if (idx !== -1) {
            all[idx].feedbackText = jsonStr;
            if (data["总结"]) all[idx].summary = data["总结"];
            localStorage.setItem("self-observation-records", JSON.stringify(all));
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      const fallback = { 关键信号: "生成反馈失败：" + msg + "，请稍后重试。", 追问: [] };
      setFeedbackData(fallback);
      setFeedbackText(JSON.stringify(fallback));
    } finally {
      setFeedbacking(false);
    }
  };

  const regenerateFeedback = async (today: Record, allRecords: Record[]) => {
    setFeedbacking(true);
    setFeedbackData(null);
    setFeedbackText("");
    setClarification("");
    setRevisedText("");
    setClarified(false);

    try {
      const history = allRecords.filter((r) => r.id !== today.id);
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, today }),
      });
      if (!res.ok) throw new Error("服务器返回错误：" + res.status);

      const json = await res.json();
      const data = json.data || json;

      setFeedbackData(data);
      const jsonStr = JSON.stringify(data);
      setFeedbackText(jsonStr);

      // 覆盖保存（清除旧的追问和修正）
      const store = localStorage.getItem("self-observation-records");
      if (store) {
        const all: Record[] = JSON.parse(store);
        const idx = all.findIndex((r) => r.id === today.id);
        if (idx !== -1) {
          all[idx].feedbackText = jsonStr;
          all[idx].clarification = undefined;
          all[idx].revisedFeedback = undefined;
          if (data["总结"]) all[idx].summary = data["总结"];
          localStorage.setItem("self-observation-records", JSON.stringify(all));
        }
      }

      setOldFeedback("");
      setHasRegenerated(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      const fallback = { 关键信号: "重新生成反馈失败：" + msg + "，请稍后重试。", 追问: [] };
      setFeedbackData(fallback);
      setFeedbackText(JSON.stringify(fallback));
    } finally {
      setFeedbacking(false);
    }
  };

  const handleClarify = async () => {
    if (clarifying || clarified || !clarification.trim()) return;
    setClarifying(true);

    try {
      const res = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalFeedback: feedbackText,
          userClarification: clarification.trim(),
        }),
      });
      if (!res.ok) throw new Error("服务器返回错误：" + res.status);

      const json = await res.json();
      const text = json.data?.["修正理解"] || json.data || json;
      const revised = typeof text === "string" ? text : JSON.stringify(text);

      setRevisedText(revised);

      if (lastSavedId) {
        const store = localStorage.getItem("self-observation-records");
        if (store) {
          const all: Record[] = JSON.parse(store);
          const idx = all.findIndex((r) => r.id === lastSavedId);
          if (idx !== -1) {
            all[idx].clarification = clarification.trim();
            all[idx].revisedFeedback = revised;
            localStorage.setItem("self-observation-records", JSON.stringify(all));
          }
        }
      }
      setClarified(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      setRevisedText("修正失败：" + msg + "，请稍后重试。");
      setClarified(true);
    } finally {
      setClarifying(false);
    }
  };

  const isEditMode = !!editId;

  return (
    <div className="min-h-screen">
      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/"
            className="text-sm text-[var(--text-label)] hover:text-[var(--text-body)] transition-colors"
          >
            &larr; 返回
          </Link>
          <h1 className="text-lg font-medium text-[var(--text-heading)] tracking-tight">
            {isEditMode ? "编辑记录" : "今日记录"}
          </h1>
          <div className="w-12" />
        </div>

        {/* 表单卡片 */}
        <div className="card-mist p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
              日期
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text-heading)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
              今天做了什么？ <span className="text-[var(--color-error)]">*</span>
            </label>
            <textarea
              value={whatHappened}
              onChange={(e) => setWhatHappened(e.target.value)}
              rows={4}
              placeholder="今天做了什么事、遇到了什么……"
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text-heading)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30 transition-colors resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
              今天最明显的情绪/状态是什么？
            </label>
            <textarea
              value={emotion}
              onChange={(e) => setEmotion(e.target.value)}
              rows={3}
              placeholder="焦虑、平静、疲惫、兴奋……或一种说不清的感觉"
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text-heading)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30 transition-colors resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
              今天什么最消耗我？
            </label>
            <textarea
              value={drain}
              onChange={(e) => setDrain(e.target.value)}
              rows={3}
              placeholder="长时间会议、社交、重复劳动……"
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text-heading)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30 transition-colors resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
              今天什么又恢复了我？
            </label>
            <textarea
              value={restore}
              onChange={(e) => setRestore(e.target.value)}
              rows={3}
              placeholder="散步、听音乐、独处、和某人聊天……"
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text-heading)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30 transition-colors resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
              今天有没有一个反复在意的瞬间？
            </label>
            <textarea
              value={moment}
              onChange={(e) => setMoment(e.target.value)}
              rows={3}
              placeholder="某个对话后一直回想、一个念头反复出现……"
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text-heading)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30 transition-colors resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
              今天我更像？
            </label>
            <input
              type="text"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              placeholder="推进 / 维持 / 逃避 / 恢复……或你自己的词"
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text-heading)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
              今天有没有一个值得记录的、「对自己」的观察？
            </label>
            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              rows={3}
              placeholder="一个有趣的想法、对自己的新发现、注意到的一个习惯……"
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text-heading)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30 transition-colors resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
              现在的你最需要什么？
            </label>
            <textarea
              value={needNow}
              onChange={(e) => setNeedNow(e.target.value)}
              rows={2}
              placeholder="休息、被理解、一个具体的答案、放下某件事……"
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text-heading)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30 transition-colors resize-y"
            />
          </div>

          {errorMsg && (
            <p className="text-sm text-[var(--color-error)]">{errorMsg}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 bg-[var(--color-primary)] text-white rounded-xl text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-40"
          >
            {saving ? "保存中……" : isEditMode ? "保存修改" : "保存记录"}
          </button>
        </div>

        {/* 编辑模式：旧反馈 */}
        {isEditMode && oldFeedback && !feedbackText && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-[var(--text-label)] mb-4 flex items-center gap-2">
              <span className="w-0.5 h-4 bg-[var(--divider)] rounded-full" />
              上一次 AI 反馈
            </h2>
            <div className="space-y-4">
              {(() => {
                const json = extractJSON(oldFeedback);
                if (json) {
                  return renderFeedbackCards(json);
                }
                return (
                  <div className="bg-[var(--tag-bg)] rounded-2xl p-6 text-sm text-[var(--text-body)] leading-relaxed whitespace-pre-wrap">
                    {oldFeedback}
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* AI 即时反馈 */}
        {showFeedback && (
          <section className="mt-12">
            <h2 className="text-sm font-medium text-[var(--text-label)] mb-4 flex items-center gap-2">
              <span className="w-0.5 h-4 bg-[var(--divider)] rounded-full" />
              {hasRegenerated
                ? "已重新生成反馈"
                : isEditMode
                ? "上一次 AI 反馈"
                : "AI 反馈"}
            </h2>
            <div className="space-y-4">
              {feedbackData ? (
                <>
                  <div className="space-y-4">
                    {renderFeedbackCards(feedbackData)}
                    <div ref={feedbackEndRef} />
                  </div>
                </>
              ) : feedbacking ? (
                <div className="card-mist p-8 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-3">
                    <span className="w-2 h-2 rounded-full bg-[var(--divider)] animate-pulse" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-[var(--divider)] animate-pulse" style={{ animationDelay: "300ms" }} />
                    <span className="w-2 h-2 rounded-full bg-[var(--divider)] animate-pulse" style={{ animationDelay: "600ms" }} />
                  </div>
                  <p className="text-sm text-[var(--text-label)]">正在梳理你的记录，大约需要 1-3 分钟</p>
                </div>
              ) : feedbackText ? (
                // 即使 feedbackData 为 null，也尝试解析 JSON 渲染卡片
                (() => {
                  const parsed = extractJSON(feedbackText);
                  if (parsed) {
                    return (
                      <div className="space-y-4">
                        {renderFeedbackCards(parsed)}
                        <div ref={feedbackEndRef} />
                      </div>
                    );
                  }
                  return (
                    <div className="card-mist p-6">
                      <div className="text-sm text-[var(--text-body)] leading-relaxed whitespace-pre-wrap">
                        {feedbackText}
                        <div ref={feedbackEndRef} />
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="text-sm text-[var(--text-label)]">暂无反馈</p>
              )}

              {/* 追问输入 — 仅当未澄清、未提交时显示 */}
              {feedbackData && !clarified && !hasExistingClarification() && !clarifying && (
                <div className="mt-8 pt-6 border-t border-[var(--card-border)]">
                  <label className="block text-sm text-[var(--text-label)] mb-3">
                    想对 AI 的反馈做出回应？
                  </label>
                  <textarea
                    value={clarification}
                    onChange={(e) => setClarification(e.target.value)}
                    rows={2}
                    placeholder="例如：不是焦虑，是无聊……"
                    className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text-heading)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30 transition-colors resize-y"
                  />
                  <button
                    onClick={handleClarify}
                    disabled={!clarification.trim()}
                    className="mt-3 px-5 py-2 bg-[var(--color-primary)] text-white rounded-xl text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-40"
                  >
                    提交回应
                  </button>
                </div>
              )}

              {/* 澄清加载动画 */}
              {clarifying && (
                <div className="card-mist p-8 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-3">
                    <span className="w-2 h-2 rounded-full bg-[var(--divider)] animate-pulse" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-[var(--divider)] animate-pulse" style={{ animationDelay: "300ms" }} />
                    <span className="w-2 h-2 rounded-full bg-[var(--divider)] animate-pulse" style={{ animationDelay: "600ms" }} />
                  </div>
                  <p className="text-sm text-[var(--text-label)]">已经收到您的反馈，正在调整理解…</p>
                </div>
              )}

              {/* 修正理解卡片 */}
              {revisedText && (
                <div className="card-mist p-6">
                  <h3 className="text-xs font-medium text-[var(--text-label)] mb-3 tracking-wide uppercase flex items-center gap-1.5">
                    <MessageCircle className="text-[var(--color-accent)]" size={14} />
                    理解与回应
                  </h3>
                  <p className="text-sm text-[var(--text-body)] leading-relaxed whitespace-pre-wrap">
                    {revisedText}
                  </p>
                </div>
              )}

              {clarified && !clarifying && (
                <p className="mt-4 text-xs text-[var(--text-label)] text-center">
                  已收到你的回应
                </p>
              )}
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => router.push("/")}
                disabled={clarifying}
                className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-xl text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-40"
              >
                完成，返回主页
              </button>
            </div>
          </section>
        )}
        {/* 覆盖确认弹框 */}
        {showOverwriteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
            <div className="card-mist p-6 max-w-sm mx-4 shadow-xl">
              <p className="text-sm text-[var(--text-body)] mb-6 leading-relaxed">
                重新保存记录会覆盖之前的分析，是否继续？
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowOverwriteConfirm(false)}
                  className="px-5 py-2 text-sm text-white bg-[var(--color-secondary)] rounded-xl hover:bg-[var(--color-secondary-hover)] transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmOverwrite}
                  className="px-5 py-2 text-sm text-white bg-[var(--color-primary)] rounded-xl hover:bg-[var(--color-primary-hover)] transition-colors"
                >
                  继续
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
