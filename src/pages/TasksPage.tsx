import { useMemo, useState, type FormEvent } from 'react';
import { Check, Plus, Trash2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { AsyncView } from '@/components/AsyncView';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { TaskForm, type TaskDraft } from '@/components/tasks/TaskForm';
import { useI18n } from '@/hooks/useI18n';
import { useErrorText } from '@/hooks/useErrorText';
import { useAsync } from '@/hooks/useAsync';
import { useDataSync } from '@/hooks/useDataSync';
import { usePreferences } from '@/hooks/usePreferences';
import { dataService } from '@/services';
import type { Task } from '@/types/models';
import type { TaskCategory, Priority } from '@/types/enums';
import { formatInZone } from '@/lib/timezone';
import { cn } from '@/lib/utils';

const CATEGORIES: TaskCategory[] = ['Study', 'Work', 'Personal', 'Exercise', 'Life', 'Other'];

const priorityTone: Record<Priority, BadgeTone> = {
  low: 'neutral',
  medium: 'primary',
  high: 'warning',
  urgent: 'danger',
};

const categoryIdOf = (c: TaskCategory) => `cat-${CATEGORIES.indexOf(c) + 1}`;

export default function TasksPage() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const { timezone } = usePreferences();
  const [activeCategory, setActiveCategory] = useState<TaskCategory | 'all'>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const tasksState = useAsync(() => dataService.tasks.list(), []);
  useDataSync('all', tasksState.refresh);

  const allTasks = useMemo(() => tasksState.data ?? [], [tasksState.data]);
  // 顶层任务（无父任务）才出现在主列表；子任务在其父卡片内展示
  const topLevel = useMemo(() => allTasks.filter((task) => !task.parent_task_id), [allTasks]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Task[]>();
    allTasks.filter((task) => task.parent_task_id).forEach((task) => {
      const list = map.get(task.parent_task_id!) ?? [];
      list.push(task);
      map.set(task.parent_task_id!, list);
    });
    return map;
  }, [allTasks]);

  const counts = useMemo(() => {
    return CATEGORIES.reduce<Record<string, number>>((acc, c) => {
      acc[c] = topLevel.filter((x) => !x.is_completed && x.category_id === categoryIdOf(c)).length;
      return acc;
    }, {});
  }, [topLevel]);

  const openCreate = () => {
    setEditing(null);
    setError('');
    setFormOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setError('');
    setFormOpen(true);
  };

  const handleSubmit = async (draft: TaskDraft) => {
    setSubmitting(true);
    setError('');
    try {
      const result = editing
        ? await dataService.tasks.update(editing.id, draft)
        : await dataService.tasks.create(draft);
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      setFormOpen(false);
      setEditing(null);
      tasksState.reload();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleComplete = async (task: Task) => {
    const next = !task.is_completed;
    const result = await dataService.tasks.update(task.id, {
      is_completed: next,
      completed_at: next ? new Date().toISOString() : null,
    });
    if (result.ok) tasksState.reload();
  };

  const deleteTask = async (task: Task) => {
    if (!window.confirm(t('tasks.deleteConfirm'))) return;
    const result = await dataService.tasks.remove(task.id);
    if (result.ok) tasksState.reload();
  };

  const restoreTask = async (task: Task) => {
    const result = await dataService.tasks.restore(task.id);
    if (result.ok) tasksState.reload();
  };

  const addSubtask = async (parent: Task, e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('subtask') as HTMLInputElement;
    const title = input.value.trim();
    if (!title) return;
    const result = await dataService.tasks.create({
      title,
      category_id: parent.category_id,
      priority: 'low',
      parent_task_id: parent.id,
      is_completed: false,
    });
    if (result.ok) {
      input.value = '';
      tasksState.reload();
    }
  };

  const toggleSubtask = async (task: Task) => {
    const next = !task.is_completed;
    const result = await dataService.tasks.update(task.id, {
      is_completed: next,
      completed_at: next ? new Date().toISOString() : null,
    });
    if (result.ok) tasksState.reload();
  };

  const currentDraft: TaskDraft | null = editing
    ? {
        title: editing.title,
        notes: editing.notes,
        category_id: editing.category_id,
        priority: editing.priority,
        estimated_minutes: editing.estimated_minutes,
        due_at: editing.due_at,
        remind_at: editing.remind_at,
        parent_task_id: editing.parent_task_id,
      }
    : null;

  return (
    <>
      <PageHeader
        title={t('tasks.title')}
        subtitle={t('tasks.subtitle')}
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('tasks.newTask')}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={cn('rounded-full px-3.5 py-1.5 text-xs transition', activeCategory === 'all' ? 'bg-primary text-white' : 'bg-card text-muted')}
          style={activeCategory === 'all' ? undefined : { borderColor: 'var(--border)', borderWidth: 1 }}
        >
          {t('common.all')}
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setActiveCategory(c)}
            className={cn('rounded-full px-3.5 py-1.5 text-xs transition', activeCategory === c ? 'bg-primary text-white' : 'bg-card text-muted')}
            style={activeCategory === c ? undefined : { borderColor: 'var(--border)', borderWidth: 1 }}
          >
            {t(`category.${c}` as const)} <span className="opacity-70">{counts[c] ?? 0}</span>
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="accent-primary" />
          {t('tasks.showCompleted')}
        </label>
      </div>

      {error && <p className="mb-3 rounded-xl bg-danger/10 px-4 py-2 text-xs text-danger">{error}</p>}

      <AsyncView state={tasksState} isEmpty={() => true} empty={<EmptyState description={t('tasks.empty')} />}>
        {(tasks) => {
          void tasks;
          const filtered = topLevel.filter((task) => {
            const matchCat = activeCategory === 'all' || task.category_id === categoryIdOf(activeCategory);
            const matchStatus = showCompleted || !task.is_completed;
            return matchCat && matchStatus;
          });
          if (filtered.length === 0) return <EmptyState description={t('tasks.empty')} />;
          return (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filtered.map((task) => {
                const children = childrenByParent.get(task.id) ?? [];
                return (
                  <Card key={task.id} className={cn('flex flex-col gap-3', task.is_completed && 'opacity-60')}>
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => void toggleComplete(task)}
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                          task.is_completed ? 'border-success bg-success text-white' : 'text-transparent hover:border-primary',
                        )}
                        style={task.is_completed ? undefined : { borderColor: 'var(--border)' }}
                        aria-label={t('tasks.title')}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-sm font-medium text-ink', task.is_completed && 'line-through')}>{task.title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge tone={priorityTone[task.priority]}>{t(`tasks.priority.${task.priority}` as const)}</Badge>
                          {task.estimated_minutes != null && <span className="text-[11px] text-muted">{task.estimated_minutes} min</span>}
                          {task.due_at && <span className="text-[11px] text-muted">· {formatInZone(task.due_at, 'MM-dd HH:mm', timezone)}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => openEdit(task)} className="rounded-lg p-1.5 text-muted hover:text-ink hover:bg-black/5 dark:hover:bg-white/5" aria-label={t('tasks.editTask')}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button type="button" onClick={() => void deleteTask(task)} className="rounded-lg p-1.5 text-muted hover:text-danger hover:bg-danger/10" aria-label={t('tasks.delete')}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>

                    {showCompleted && task.is_completed && (
                      <button type="button" onClick={() => void restoreTask(task)} className="self-start text-[11px] text-primary hover:underline">
                        {t('tasks.restore')}
                      </button>
                    )}

                    {(children.length > 0 || !task.is_completed) && (
                      <div className="ml-8 border-l pl-3" style={{ borderColor: 'var(--border)' }}>
                        {children.map((child) => (
                          <div key={child.id} className="flex items-center gap-2 py-1">
                            <button
                              type="button"
                              onClick={() => void toggleSubtask(child)}
                              className={cn(
                                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                child.is_completed ? 'border-success bg-success text-white' : 'text-transparent',
                              )}
                              style={child.is_completed ? undefined : { borderColor: 'var(--border)' }}
                              aria-label={child.title}
                            >
                              <Check className="h-3 w-3" aria-hidden />
                            </button>
                            <span className={cn('flex-1 truncate text-xs text-muted', child.is_completed && 'line-through')}>{child.title}</span>
                            <button type="button" onClick={() => void deleteTask(child)} className="text-muted hover:text-danger" aria-label={t('common.delete')}>
                              <Trash2 className="h-3 w-3" aria-hidden />
                            </button>
                          </div>
                        ))}
                        <form onSubmit={(e) => void addSubtask(task, e)} className="mt-1 flex gap-2">
                          <input
                            name="subtask"
                            placeholder={t('tasks.subtaskPlaceholder')}
                            className="min-w-0 flex-1 rounded-lg border bg-card px-2 py-1 text-xs text-ink placeholder:text-muted/60"
                            style={{ borderColor: 'var(--border)' }}
                          />
                          <Button type="submit" size="sm" variant="ghost" aria-label={t('tasks.addSubtask')}>
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </form>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          );
        }}
      </AsyncView>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? t('tasks.editTask') : t('tasks.newTask')}>
        <TaskForm
          initial={currentDraft}
          candidates={topLevel.filter((task) => task.id !== editing?.id)}
          timezone={timezone}
          submitting={submitting}
          onSubmit={(draft) => void handleSubmit(draft)}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>
    </>
  );
}
