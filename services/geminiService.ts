
import { GoogleGenAI, Type } from "@google/genai";
import { Task, Requirement, MeetingLog, AIProgressResult } from "../types";

// Always use process.env.API_KEY directly for initialization as per guidelines.
// Assume process.env.API_KEY is pre-configured and valid.
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY as string });

/**
 * Generates an AI summary for project reporting using Gemini 3 Flash.
 */
export const generateAISummary = async (
  type: 'workflow' | 'requirements' | 'meetings',
  data: any[]
): Promise<string> => {
  const ai = getAI();
  const promptData = JSON.stringify(data);
  const prompt = `당신은 전문 프로젝트 관리 컨설턴트입니다. 다음 프로젝트 데이터를 분석하여 한국어로 전문적인 PPT 요약 보고서 초안을 작성하십시오. 핵심 성과, 위험 요소, 향후 계획이 포함되어야 합니다:\n\n데이터 유형: ${type}\n데이터: ${promptData}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      temperature: 0.7,
      topP: 0.8,
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  return response.text || "요약을 생성할 수 없습니다.";
};

/**
 * Calculates task progress using structured reasoning with Gemini 3 Pro.
 */
export const calculateTaskProgress = async (
  task: Partial<Task>,
  requirements: Requirement[],
  meetings: MeetingLog[]
): Promise<AIProgressResult> => {
  const ai = getAI();
  
  const contextReq = requirements.slice(0, 5).map(r => `[${r.category}] ${r.title}: ${r.content.substring(0, 50)}`).join('\n');
  const contextMeetings = meetings.slice(0, 3).map(m => `[${m.date}] ${m.title}`).join('\n');

  const prompt = `당신은 프로젝트 관리 AI입니다. 다음 작업의 진행률을 0에서 100 사이의 숫자로 평가하십시오.
  
  [배경 지식]
  요구사항:
  ${contextReq}
  
  관련 회의:
  ${contextMeetings}

  [평가할 작업]
  제목: ${task.title}
  마감일: ${task.deadline}
  상세 내용: ${task.description}

  [평가 기준]
  1. 요구사항 준수 여부
  2. 상세 내용의 구체성
  3. 마감일 대비 진행 정도

  응답은 반드시 JSON 형식으로만 작성하십시오.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          percentage: { type: Type.NUMBER, description: "진행률 (0-100)" },
          reasoning: { type: Type.STRING, description: "평가 근거 (한국어)" }
        },
        required: ["percentage", "reasoning"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}") as AIProgressResult;
  } catch (e) {
    return { percentage: 0, reasoning: "분석 결과를 해석할 수 없습니다." };
  }
};
