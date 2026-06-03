export const maxDuration = 60;

import { NextRequest } from "next/server";

const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

const SYSTEM_PROMPT = `你是用户的长期 AI 自我观察协作者。你收到用户的全部历史 Daily Log。请基于这些长期材料，生成一份"阶段性自我观察报告"。

这不是普通周报，而是对"用户这个人"的阶段性理解更新。后期分析应比前期更了解用户，而不是每次都像第一次认识他。

你只能返回一个合法的 JSON 对象，包含以下 9 个字段。每个字段的值是一个字符串数组，包含 3-5 个要点。每个要点必须使用"小标题：深度分析"的格式。不要使用任何 markdown 符号（不要 **、不要 #、不要 -、不要 *、不要 >、不要 \`）。不要包含任何其他文字：
{
  "整体状态概览": ["小标题：分析正文", "小标题：分析正文"],
  "关注主题": ["小标题：分析正文", "小标题：分析正文"],
  "情绪与焦虑模式": ["小标题：分析正文", "小标题：分析正文"],
  "消耗与恢复模式": ["小标题：分析正文", "小标题：分析正文"],
  "行动风格与卡点": ["小标题：分析正文", "小标题：分析正文"],
  "性格特质观察": ["小标题：分析正文", "小标题：分析正文"],
  "成长阶段判断": ["小标题：分析正文", "小标题：分析正文"],
  "长期理解更新": ["小标题：分析正文", "小标题：分析正文"],
  "下阶段建议": ["小标题：分析正文", "小标题：分析正文"]
}

注意：所有要点必须是纯自然语言文本，绝对不要使用任何 markdown 符号（不要 **、不要 #、不要 -、不要 *、不要 >、不要 \`）。每个要点用中文冒号分隔标题与正文。

【内容要求】
请基于用户全部记录，按以下结构输出 JSON。每个要点必须包含"小标题：深度分析"：

标题部分：几个字点出这一要点在讲什么
分析正文：2-4 句，必须包含完整的推理链条：【现象 → 背后原因/心理机制 → 关联或影响】

1. 整体状态概览：本阶段精力、情绪、焦虑、睡眠趋势；与过去相比的变化
2. 关注主题：本阶段反复关注的议题，背后可能反映的需求
3. 情绪与焦虑模式：主要触发点、重复情绪路径、是否出现新变化
4. 消耗与恢复模式：长期消耗来源、有效恢复方式、作息影响
5. 行动风格与卡点：如何推进、如何进入状态、如何卡住
6. 性格特质观察：新理解、被强化的判断、出现的变化、待验证假设
7. 成长阶段判断：当前阶段、核心矛盾、正在发展的能力、正在摆脱的旧模式
8. 长期理解更新：新增观察、被强化的判断、需要修正的判断、暂不确定继续观察
9. 下阶段建议：一个最重要调整方向、三个轻量行动、一个需避免的旧模式、一个继续观察的问题

【分析深度要求】
- 每个要点要做"分析"而非"复述"——不要重描用户写了什么，而要解释"这意味着什么""为什么可能发生""和之前的记录有什么关联"
- 包含推理链：观察到什么 → 可能的原因/机制 → 与历史或其他因素的关联
- 可以使用推测语气（"可能""似乎""推测"），但必须基于记录中的具体信息
- 特别注意在"长期理解更新"中体现对用户过往澄清纠正的回应

【表达规则】
- 全程区分：已观察事实 / 当前推测 / 待验证假设
- 不诊断、不贴人格标签、不鸡汤、不玄学、不宏大建议
- 允许模糊，优先寻找"重复性"而非"戏剧性"`;

async function fetchFullResponse(messages: { role: string; content: string }[]): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    signal: AbortSignal.timeout(55000),
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullText = "";
  let leftover = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = leftover + decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");
    // 最后一段可能是未完成行，缓存到下一轮
    leftover = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || "";
        if (content) fullText += content;
      } catch {}
    }
  }

  // 处理最后一轮可能剩余的行
  if (leftover.startsWith("data: ")) {
    const data = leftover.slice(6);
    if (data !== "[DONE]") {
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || "";
        if (content) fullText += content;
      } catch {}
    }
  }

  return fullText;
}

/** 容错解析 JSON */
function safeParseJSON(text: string): Record<string, any> | null {
  if (!text || !text.trim()) return null;

  // 策略1：直接解析
  try {
    return JSON.parse(text);
  } catch {}

  // 策略2：提取第一个 { 到最后一个 } 之间的内容
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
  } catch {}

  return null;
}

function buildFallback(raw: string) {
  // 如果 raw 是完整的 JSON 对象，直接提取字段，避免整段塞进一个字段
  if (raw && raw.trim()) {
    try {
      const trimmed = raw.trim();
      if (trimmed.startsWith("{")) {
        const parsed = JSON.parse(trimmed);
        const expectedKeys = ["整体状态概览", "关注主题", "情绪与焦虑模式", "消耗与恢复模式", "行动风格与卡点", "性格特质观察", "成长阶段判断", "长期理解更新", "下阶段建议"];
        const hasAnyField = expectedKeys.some((k) => k in parsed);
        if (hasAnyField) {
          const result: Record<string, any> = {};
          for (const k of expectedKeys) {
            result[k] = k in parsed ? parsed[k] : "";
          }
          return result;
        }
      }
    } catch {}
  }

  return {
    "整体状态概览": raw || "报告生成异常，请稍后重试。",
    "关注主题": "",
    "情绪与焦虑模式": "",
    "消耗与恢复模式": "",
    "行动风格与卡点": "",
    "性格特质观察": "",
    "成长阶段判断": "",
    "长期理解更新": "",
    "下阶段建议": "",
  };
}

export async function POST(request: NextRequest) {
  if (!API_KEY) {
    return Response.json({
      success: false,
      data: buildFallback("服务端未配置 API Key"),
    });
  }

  try {
    const body = await request.json();
    const records = body.records;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return Response.json({
        success: false,
        data: buildFallback("没有记录可供分析"),
      });
    }

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: JSON.stringify(records),
      },
    ];

    let lastRaw = "";

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await fetchFullResponse(messages);
        lastRaw = raw;

        const parsed = safeParseJSON(raw);
        if (parsed) {
          return Response.json({ success: true, data: parsed });
        }

        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err) {
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw err;
      }
    }

    // 两次都失败，返回兜底
    return Response.json({
      success: false,
      data: buildFallback(lastRaw),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "请求处理失败";
    return Response.json({
      success: false,
      data: buildFallback(msg),
    });
  }
}
