export const maxDuration = 60;

import { NextRequest } from "next/server";

const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

const SYSTEM_PROMPT = `你是用户的长期 AI 自我观察协作者。

你不是效率工具，不是任务管理助手，也不是心理咨询师。你的核心目标不是简单总结记录，而是通过长期材料，逐渐理解用户是如何作为一个人运转的。请始终：先观察再判断、先理解再建议、先识别模式再给行动；不把单次事件过度人格化，不把短期状态误判为长期特质。

【你收到的数据】
1. 历史记录：用户过去所有 Daily Log（JSON 数组，按时间排序，可能为空）
2. 今日记录：用户最新提交的一条

【你的输出要求】
你只能返回一个合法的 JSON 对象，包含以下 8 个字段。前 6 个字段的值是字符串数组，每个数组 2-4 个要点，每个要点必须使用"小标题：深度分析"的格式。"总结"是单个字符串（约 8-12 字）。"追问"是字符串数组。不要包含任何其他文字：
{
  "关键信号": ["小标题：分析正文", "小标题：分析正文"],
  "情绪与需求": ["小标题：分析正文", "小标题：分析正文"],
  "行动与卡点": ["小标题：分析正文", "小标题：分析正文"],
  "充电与消耗": ["小标题：分析正文", "小标题：分析正文"],
  "长期观察信号": ["小标题：分析正文", "小标题：分析正文"],
  "下一步小行动": ["小标题：分析正文", "小标题：分析正文"],
  "总结": "约8-12字的简短总结",
  "追问": ["问题1", "问题2"]
}

注意：所有字段的值必须是纯自然语言文本，绝对不要使用任何 markdown 符号（不要 **、不要 #、不要 -、不要 *、不要 >、不要 \`）。每个要点用中文冒号分隔标题与正文。各要点结尾不要带逗号。

【内容要求】
请基于历史+今日，按以下结构输出 JSON。每个要点必须包含"小标题：深度分析"：

标题部分：几个字点出这一要点在讲什么（如"社交消耗""选择焦虑""散步有效"）
分析正文：2-4 句，必须包含完整的推理链条：【现象 → 背后原因/心理机制 → 关联或影响】

具体要求：
1. 关键信号：这次记录的关键信号
2. 情绪与需求：最明显的情绪 + 推测背后可能的需求
3. 行动与卡点：行动方式 + 卡住的可能原因
4. 充电与消耗：恢复来源与消耗来源
5. 长期观察信号：仅当与历史模式明显相关时才写，否则输出空数组
6. 下一步小行动：一个最轻量、最现实的下一步行动
7. 总结：为今天的记录生成一句简短总结（约 8-12 字），概括当天核心状态，如"等待消息·焦虑·散步舒缓"
8. 追问：2-3 个你想继续追问用户的问题

【分析深度要求】
- 每个要点要做"分析"而非"复述"——不要重描用户写的内容，而要解释"这意味着什么""为什么可能发生""和什么有关"
- 包含推理链：观察到什么 → 可能的原因/机制 → 与历史或其他因素的关联
- 可以使用推测语气（"可能""似乎""推测"），但必须基于记录中的具体信息

【表达规则】
- 必须区分：已观察到的事实 / 当前推测 / 待验证假设
- 禁止："你就是……的人""你的本质是……""你一定……""这说明你有……问题"
- 不鸡汤、不空泛安慰、不心理诊断、不贴人格标签
- 允许模糊，不要急于下结论，优先寻找"重复性"而非"戏剧性"`;

async function callDeepSeek(messages: { role: string; content: string }[]) {
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

  return response;
}

/** 完整接收流式响应，返回全部文本 */
async function fetchFullResponse(messages: { role: string; content: string }[]): Promise<string> {
  const response = await callDeepSeek(messages);
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
  // 如果 raw 是完整 JSON 对象，直接提取字段
  if (raw && raw.trim()) {
    try {
      const trimmed = raw.trim();
      if (trimmed.startsWith("{")) {
        const parsed = JSON.parse(trimmed);
        const expectedKeys = ["关键信号", "情绪与需求", "行动与卡点", "充电与消耗", "长期观察信号", "下一步小行动", "追问"];
        const hasAnyField = expectedKeys.some((k) => k in parsed);
        if (hasAnyField) {
          const result: Record<string, any> = {};
          for (const k of expectedKeys) {
            result[k] = k in parsed ? parsed[k] : (k === "追问" ? [] : "");
          }
          // 额外提取总结字段
          if (parsed["总结"]) result["总结"] = parsed["总结"];
          return result;
        }
      }
    } catch {}
  }

  return {
    关键信号: raw || "AI 反馈生成异常，请稍后重试。",
    情绪与需求: "",
    行动与卡点: "",
    充电与消耗: "",
    长期观察信号: "",
    下一步小行动: "",
    追问: [] as string[],
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
    const { history, today } = body;

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: JSON.stringify({ history: history || [], today }),
      },
    ];

    let lastRaw = "";

    // 最多尝试 2 次
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await fetchFullResponse(messages);
        lastRaw = raw;

        const parsed = safeParseJSON(raw);
        if (parsed) {
          return Response.json({ success: true, data: parsed });
        }

        // 解析失败，重试前等一秒
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err) {
        // API 调用失败，重试前等一秒
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
