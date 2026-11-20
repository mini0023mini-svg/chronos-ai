import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useI18n } from '@/hooks/useI18n';
import type { Task } from '@/types/models';
import type { Priority, TaskCategory } from '@/types/enums';
import { DEFAULT_TIMEZONE, formatInZone, fromZoneTime } from '@/lib/timezone';

const CATEGORIES: TaskCategory[] = ['Study', 'Work', 'Personal', 'Exercise', 'Life', 'Other'];
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

function toLocalInput(iso: string, zone: string): string {
  return formatInZone(iso, "yyyy-MM-dd'T'HH:mm", zone);
}
function fromLocalInput(value: string, zone: string): string | null {
  return value ? fromZoneTime(value, zone).toISOString() : null;
}

export interface TaskDraft {
  title: string;
  notes: string | null;
  category_id: string | null;
  priority: Priority;
  estimated_minutes: number | null;
  due_at: string | null;
  remind_at: string | null;
  parent_task_id: string | null;
}

export interface TaskFormProps {
  initial: TaskDraft | null;
  candidates: Task[];
  timezone?: string;
  submitting?: boolean;
  onSubmit: (draft: TaskDraft) => void;
  onCancel: () => void;
}

/** 任务表单：全字段（分类/优先级/耗时/截止/提醒/备注/父任务） */
export function TaskForm({
  initial,
  candidates,
  timezone = DEFAULT_TIMEZONE,
  submitting = false,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? 'cat-1');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium');
  const [estimated, setEstimated] = useState(initial?.estimated_minutes?.toString() ?? '30');
  const [due, setDue] = useState(initial?.due_at ? toLocalInput(initial.due_at, timezone) : '');
  const [remind, setRemind] = useState(initial?.remind_at ? toLocalInput(initial.remind_at, timezone) : '');
  const [parentId, setParentId] = useState(initial?.parent_task_id ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initial) return;
    setTitle(initial.title);
    setNotes(initial.notes ?? '');
    setCategoryId(initial.category_id ?? 'cat-1');
    setPriority(initial.priority);
    setEstimated(initial.estimated_minutes?.toString() ?? '');
    setDue(initial.due_at ? toLocalInput(initial.due_at, timezone) : '');
    setRemind(initial.remind_at ? toLocalInput(initial.remind_at, timezone) : '');
    setParentId(initial.parent_task_id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(t('tasks.titleField') + ' *');
      return;
    }
    setError('');
    onSubmit({
      title: title.trim(),
      notes: notes.trim() || null,
      category_id: categoryId || null,
      priority,
      estimated_minutes: estimated ? Math.max(0, Number(estimated)) : null,
      due_at: fromLocalInput(due, timezone),
      remind_at: fromLocalInput(remind, timezone),
      parent_task_id: parentId || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label={t('tasks.titleField')} value={title} onChange={(e) => setTitle(e.target.value)} error={error ? error : undefined} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label={t('tasks.category')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {CATEGORIES.map((c, i) => <option key={c} value={`cat-${i + 1}`}>{t(`category.${c}` as const)}</option>)}
        </Select>
        <Select label={t('tasks.priority')} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{t(`tasks.priority.${p}` as const)}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label={t('tasks.estimated')} type="number" min={0} value={estimated} onChange={(e) => setEstimated(e.target.value)} />
        <Select label={t('tasks.parentTask')} value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{t('tasks.noParent')}</option>
          {candidates.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label={t('tasks.dueAt')} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        <Input label={t('tasks.remindAt')} type="datetime-local" value={remind} onChange={(e) => setRemind(e.target.value)} />
      </div>

      <Input label={t('tasks.notesField')} value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={submitting}>{t('common.save')}</Button>
      </div>
    </form>
  );
}
