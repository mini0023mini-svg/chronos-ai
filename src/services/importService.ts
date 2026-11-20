import type { Result, AiContext } from '@/types/api';
import { ok, fail } from '@/types/api';
import type { PendingAction, ImportRecord, ImportItem, Category } from '@/types/models';
import type { ImportSourceType } from '@/types/enums';
import { Errors, AppError } from '@/lib/errors';
import { makeId } from '@/lib/utils';
import { dataService, aiService } from './index';
import { calendarService } from './calendarService';
import { annotateRisks, parseLocalText, type ImportCandidate } from '@/lib/importParser';
import { recognizeImage, type OcrProgress } from '@/lib/ocr';
import type { RecurrenceSpec } from '@/lib/recurrence';

export type { ImportCandidate } from '@/lib/importParser';

/** 导入编排结果：预览候选 + 解析来源（AI / 本地降级） */
export interface ImportParseResult {
  candidates: ImportCandidate[];
  source: 'ai' | 'local';
  rawText: string;
  notice?: string;
}

/** 从文件扩展名推断导入来源类型 */
export function sourceTypeOf(file: File): ImportSourceType {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg'].includes(ext)) return 'jpg';
  if (ext === 'png') return 'png';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx') return 'xlsx';
  return 'txt';
}

/** 图片类型（本地无法 OCR，需 AI 网关或手动录入） */
function isImage(source: ImportSourceType): boolean {
  return source === 'jpg' || source === 'png';
}

/**
 * 从文件提取纯文本。
 * - TXT：File.text()
 * - XLSX / DOCX：用免费库在浏览器本地解析（xlsx / mammoth）
 * - PDF：pdfjs-dist 本地抽取文字
 * - 图片：本地 OCR（tesseract.js）识别中文；失败时返回空并给出手动输入降级提示（不抛错瘫痪）
 */
export async function extractText(
  file: File,
  onProgress?: (p: OcrProgress) => void,
): Promise<Result<{ text: string; notice?: string }>> {
  const source = sourceTypeOf(file);
  try {
    if (isImage(source)) {
      const ocr = await recognizeImage(file, onProgress);
      if (ocr.ok && ocr.data.text) {
        return ok({ text: ocr.data.text });
      }
      // OCR 失败或空结果 → 降级为手动输入提示，不中断导入流程
      return ok({
        text: '',
        notice: '图片文字识别未成功（可能需要联网下载识别包）；请在文本框手动输入内容后识别（不影响导入流程）。',
      });
    }
    if (source === 'txt') {
      return ok({ text: await file.text() });
    }
    if (source === 'xlsx') {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const parts: string[] = [];
      for (const name of wb.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
        parts.push(csv);
      }
      return ok({ text: parts.join('\n') });
    }
    if (source === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return ok({ text: result.value });
    }
    if (source === 'pdf') {
      const pdfjs = await import('pdfjs-dist');
      // worker 用 CDN 会在离线环境失败；此处走 Vite 打包的本地 worker
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const parts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i += 1) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        parts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      }
      return ok({ text: parts.join('\n') });
    }
    return ok({ text: await file.text() });
  } catch (err) {
    return fail(new AppError('VALIDATION', `文件解析失败：${err instanceof Error ? err.message : String(err)}`, err));
  }
}

/** AI PendingAction 的 kind 中，导入流程仅消费 create_* 三类 */
type ImportKind = ImportCandidate['kind'];
function toImportKind(kind: PendingAction['kind']): ImportKind {
  return kind === 'create_task' ? 'create_task'
    : kind === 'create_deadline' ? 'create_deadline'
    : 'create_event';
}

/** 把 AI 返回的 PendingAction 映射为可预览的候选项 */
function fromAiActions(actions: PendingAction[], rawText: string): ImportCandidate[] {
  return actions.map((a) => {
    const p = a.payload;
    const title = typeof p.title === 'string' ? p.title : a.description;
    const recurrence = (p.recurrence ?? null) as RecurrenceSpec | null;
    const startAt = typeof p.start_at === 'string' ? p.start_at : undefined;
    const dueAt = typeof p.due_at === 'string' ? p.due_at : undefined;
    const missingDate = !startAt && !dueAt;
    return {
      id: a.id || makeId(),
      kind: toImportKind(a.kind),
      title,
      start_at: startAt,
      end_at: typeof p.end_at === 'string' ? p.end_at : undefined,
      all_day: p.all_day === true,
      location: typeof p.location === 'string' ? p.location : null,
      due_at: dueAt,
      recurrence,
      category_name: typeof p.category_name === 'string' ? p.category_name : undefined,
      confidence: typeof p.confidence === 'number' ? p.confidence : 0.9,
      needsConfirm: missingDate || a.conflicts.length > 0,
      flags: { missingDate, conflict: a.conflicts.length > 0 },
      conflicts: a.conflicts,
      source: rawText.slice(0, 120),
    };
  });
}

/**
 * 导入编排：优先调用 AI 网关（若已部署），失败或不可用时自动降级到本地解析。
 * 保证「AI 不可用 → 导入流程仍正常」。
 */
export async function parseImport(
  input: string | File,
  ctx: AiContext,
  existingTitles: string[],
  onProgress?: (p: OcrProgress) => void,
): Promise<Result<ImportParseResult>> {
  let rawText = '';
  let notice: string | undefined;

  if (typeof input === 'string') {
    rawText = input;
  } else {
    const extracted = await extractText(input, onProgress);
    if (!extracted.ok) return fail(extracted.error);
    rawText = extracted.data.text;
    notice = extracted.data.notice;
  }

  // 先尝试 AI（若网关已部署且可用）
  if (aiService.isAvailable() && rawText.trim()) {
    const aiResult = await aiService.importParse(input);
    if (aiResult.ok) {
      const candidates = annotateRisks(fromAiActions(aiResult.data, rawText), existingTitles);
      return ok({ candidates, source: 'ai', rawText, notice });
    }
    // AI 失败 → 继续走本地降级，不中断流程
    notice = 'AI 识别暂时不可用，已自动切换为本地规则识别。';
  }

  if (!rawText.trim()) {
    return ok({ candidates: [], source: 'local', rawText, notice });
  }

  const candidates = annotateRisks(
    parseLocalText(rawText, { now: new Date(ctx.date), timezone: ctx.timezone }),
    existingTitles,
  );
  return ok({ candidates, source: 'local', rawText, notice });
}

/** 分类名 → category_id（找不到则 null） */
function categoryIdByName(name: string | undefined, categories: Category[]): string | null {
  if (!name) return null;
  const hit = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
  return hit?.id ?? null;
}

/** 确认写入：只写入用户勾选的候选项；每条候选可选填日期后再写 */
export async function confirmImport(
  candidates: ImportCandidate[],
  selectedIds: string[],
  ctx: AiContext,
  categories: Category[],
): Promise<Result<{ created: number; importId: string }>> {
  const selected = candidates.filter((c) => selectedIds.includes(c.id));
  if (selected.length === 0) return fail(Errors.validation('未选择任何要写入的条目'));

  // 1. 建立导入批次记录
  const importRec = await dataService.imports.create({
    source_type: 'paste',
    file_path: null,
    raw_text: `导入 ${selected.length} 条`,
    status: 'preview',
    timezone: ctx.timezone,
  } as Partial<ImportRecord>);
  if (!importRec.ok) return fail(importRec.error);
  const importId = importRec.data.id;

  let created = 0;
  for (const c of selected) {
    // 缺日期的候选在确认时若仍无时间，跳过并记为失败项，避免写入脏数据
    if ((c.kind === 'create_event' && !c.start_at) || (c.kind !== 'create_event' && !c.due_at)) {
      await dataService.importItems.create({
        import_id: importId,
        item_type: c.kind.replace('create_', '') as 'event' | 'task' | 'deadline',
        payload: { source: c.source, reason: 'missing_date' },
        confidence: c.confidence,
        needs_confirm: true,
        is_duplicate: Boolean(c.flags.duplicate),
        has_conflict: false,
        missing_date: true,
        confirmed: false,
        target_id: null,
        timezone: ctx.timezone,
      } as Partial<ImportItem>);
      continue;
    }

    let targetId: string | null = null;
    if (c.kind === 'create_event') {
      const result = await calendarService.createEvent({
        title: c.title,
        description: c.source,
        location: c.location ?? null,
        start_at: c.start_at as string,
        end_at: c.end_at ?? c.start_at as string,
        all_day: c.all_day ?? false,
        category_id: categoryIdByName(c.category_name, categories),
        timezone: ctx.timezone,
        recurrence: c.recurrence,
      });
      if (!result.ok) return fail(result.error);
      targetId = result.data.id;
    } else if (c.kind === 'create_task') {
      const result = await dataService.tasks.create({
        title: c.title,
        notes: c.source,
        due_at: c.due_at ?? null,
        category_id: categoryIdByName(c.category_name, categories),
        priority: 'medium',
        estimated_minutes: null,
        remind_at: null,
        is_completed: false,
        completed_at: null,
        parent_task_id: null,
        event_id: null,
        timezone: ctx.timezone,
      });
      if (!result.ok) return fail(result.error);
      targetId = result.data.id;
    } else {
      const result = await dataService.deadlines.create({
        title: c.title,
        description: c.source,
        due_at: c.due_at as string,
        status: 'not_started',
        custom_reminder_at: null,
        category_id: null,
        related_task_id: null,
        related_event_id: null,
        timezone: ctx.timezone,
      });
      if (!result.ok) return fail(result.error);
      targetId = result.data.id;
    }

    await dataService.importItems.create({
      import_id: importId,
      item_type: c.kind.replace('create_', '') as 'event' | 'task' | 'deadline',
      payload: { title: c.title, source: c.source },
      confidence: c.confidence,
      needs_confirm: c.needsConfirm,
      is_duplicate: Boolean(c.flags.duplicate),
      has_conflict: Boolean(c.flags.conflict),
      missing_date: Boolean(c.flags.missingDate),
      confirmed: true,
      target_id: targetId,
      timezone: ctx.timezone,
    } as Partial<ImportItem>);

    created += 1;
  }

  await dataService.imports.update(importId, { status: 'confirmed' });
  return ok({ created, importId });
}

/** 检测候选事件与现有日程的冲突，写回 flags（用于预览提示） */
export function markConflicts(
  candidates: ImportCandidate[],
  detect: (c: ImportCandidate) => string[],
): ImportCandidate[] {
  return candidates.map((c) => {
    if (c.kind !== 'create_event' || !c.start_at) return c;
    const conflicts = detect(c);
    return {
      ...c,
      conflicts,
      flags: { ...c.flags, conflict: conflicts.length > 0 },
      needsConfirm: c.needsConfirm || conflicts.length > 0,
    };
  });
}
