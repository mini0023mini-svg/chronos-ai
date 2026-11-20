/**
 * 本地 OCR —— 基于 tesseract.js 在浏览器内识别图片文字，完全免费、无需服务端密钥。
 *
 * 设计约束：
 *   - 动态 import：OCR 引擎与中文语言包仅在用户识别图片时才加载，不增大首屏包。
 *   - 中文语言包（chi_sim，约 20MB）走公共 CDN 按需下载并缓存在浏览器，不打包进仓库
 *     （GitHub Pages 仓库体积敏感，且离线时由调用方降级为手动输入，不影响核心流程）。
 *   - 识别失败（离线 / 语言包下载失败 / 图片损坏）时抛出错误，由上层降级，不使应用瘫痪。
 */
import type { Result } from '@/types/api';
import { ok, fail } from '@/types/api';
import { AppError } from '@/lib/errors';

/** OCR 进度阶段：加载引擎 → 加载语言包 → 识别文字 */
export type OcrStage = 'loading-engine' | 'loading-language' | 'recognizing';

export interface OcrProgress {
  stage: OcrStage;
  /** 0–1 */
  progress: number;
}

/** 识别结果：识别出的纯文本 */
export interface OcrResult {
  text: string;
}

/**
 * 在浏览器内识别图片中的文字（中文简体）。
 * @param file 图片文件（JPG / PNG）
 * @param onProgress 可选进度回调，用于 UI 显示"识别中 X%"
 */
export async function recognizeImage(
  file: File | Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<Result<OcrResult>> {
  try {
    // 动态加载：仅图片识别路径触发，避免拖慢首屏
    const { createWorker } = await import('tesseract.js');

    onProgress?.({ stage: 'loading-engine', progress: 0 });
    const worker = await createWorker('chi_sim', 1, {
      logger: (m) => {
        if (!onProgress) return;
        const status = String(m.status ?? '');
        if (status.includes('language') || status.includes('traineddata')) {
          onProgress({ stage: 'loading-language', progress: normalize(m.progress) });
        } else if (status.includes('recognizing')) {
          onProgress({ stage: 'recognizing', progress: normalize(m.progress) });
        }
      },
    });

    try {
      onProgress?.({ stage: 'recognizing', progress: 0 });
      const { data } = await worker.recognize(file);
      return ok({ text: cleanOcrText(data.text ?? '') });
    } finally {
      // 释放 Worker，避免重复识别时累积内存
      await worker.terminate();
    }
  } catch (err) {
    return fail(
      new AppError(
        'VALIDATION',
        `图片识别失败：${err instanceof Error ? err.message : String(err)}`,
        err,
      ),
    );
  }
}

function normalize(p: unknown): number {
  return typeof p === 'number' && Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
}

/**
 * 清理 OCR 文本：tesseract 中文识别常在汉字间插入空格（如「上 线 门槛」），
 * 合并「汉字↔汉字」之间以及「汉字↔数字」之间的多余空格，提升后续规则引擎的关键词命中率。
 * 保留换行与行内正常英文单词间距。
 */
export function cleanOcrText(text: string): string {
  const collapse = (line: string): string => {
    let out = line;
    let prev: string;
    // 反复替换至稳定：相邻匹配会在单次扫描中跳过已消费字符，需多轮才能合并连续汉字
    do {
      prev = out;
      out = out
        .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
        .replace(/([\u4e00-\u9fa5])\s+([0-9])/g, '$1$2')
        .replace(/([0-9])\s+([\u4e00-\u9fa5])/g, '$1$2');
    } while (out !== prev);
    return out.trim();
  };
  return text.split('\n').map(collapse).join('\n').trim();
}
