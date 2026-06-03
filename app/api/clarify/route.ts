export const maxDuration = 60;

import { NextRequest } from "next/server";

const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

const SYSTEM_PROMPT = `用户对你刚才的反馈做了澄清或纠正。这非常重要——用户的纠正是帮助你更准确理解他的关键信号。

你必须只返回一个合法的 JSON 对象，包含一个字段"修正理解"，值为纯自然语言文本，不要使用任何 markdown 符号。

请基于用户纠正，在"修正理解"字段中：
1. 明确承认并吸收这个纠正（如"我之前的理解偏了，修正为……"）
2. 基于纠正后的信息，给出更新后的简短理解（不要重复全部分析，只更新被纠正的部分）
3. 保持克制、真实、不讨好

记住：这次纠正本身就是关于"用户真实运转方式"的高价值材料。`;

/** 完整接收流式响应，返回全部文本 */
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

  if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");
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

export async function POST(request: NextRequest) {
  if (!API_KEY) {
    return Response.json({
      success: false,
      data: { 修正理解: "服务端未配置 API Key" },
    });
  }

  try {
    const { originalFeedback, userClarification } = await request.json();
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: `原始反馈：\n${originalFeedback}\n\n用户的澄清：\n${userClarification}`,
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

    return Response.json({
      success: false,
      data: { 修正理解: lastRaw || "AI 回应生成异常，请稍后重试。" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "请求处理失败";
    return Response.json({
      success: false,
      data: { 修正理解: msg },
    });
  }
}
