import { useEffect, useMemo, useState } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useMaterials } from '@/hooks-api/useMaterials';
import {
  useRequiredMaterials,
  useSetRequiredMaterials,
} from '@/hooks-api/useAssessmentGating';

interface DraftEntry {
  material_id: string;
  min_progress_percent: number;
}

interface RequiredMaterialsEditorProps {
  classId: string;
  assignmentId: string;
}

/**
 * Teacher-facing editor for the LM-gating policy of a single assessment.
 * Lets teachers (1) toggle the gate on/off and (2) pick which materials a
 * student must complete (and to what threshold) before submitting.
 */
export function RequiredMaterialsEditor({
  classId,
  assignmentId,
}: RequiredMaterialsEditorProps) {
  const { toast } = useToast();
  const { data: materials } = useMaterials(classId);
  const { data: requiredData, isLoading } = useRequiredMaterials(assignmentId);
  const saveMutation = useSetRequiredMaterials(assignmentId);

  const [enabled, setEnabled] = useState(false);
  const [draft, setDraft] = useState<DraftEntry[]>([]);
  const [pickerValue, setPickerValue] = useState<string>('');

  useEffect(() => {
    if (!requiredData) return;
    setEnabled(Boolean(requiredData.gating_enabled));
    setDraft(
      requiredData.materials.map((m) => ({
        material_id: m.material_id,
        min_progress_percent: m.min_progress_percent,
      }))
    );
  }, [requiredData]);

  const materialsById = useMemo(() => {
    const map = new Map<string, { id: string; title: string }>();
    for (const m of materials || []) {
      map.set(m.id, { id: m.id, title: m.title });
    }
    return map;
  }, [materials]);

  const availableToAdd = useMemo(() => {
    const taken = new Set(draft.map((d) => d.material_id));
    return (materials || []).filter((m) => !taken.has(m.id));
  }, [materials, draft]);

  const handleAdd = () => {
    if (!pickerValue) return;
    if (draft.some((d) => d.material_id === pickerValue)) return;
    setDraft((prev) => [
      ...prev,
      { material_id: pickerValue, min_progress_percent: 100 },
    ]);
    setPickerValue('');
  };

  const handleRemove = (materialId: string) => {
    setDraft((prev) => prev.filter((d) => d.material_id !== materialId));
  };

  const handleThreshold = (materialId: string, value: number) => {
    const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    setDraft((prev) =>
      prev.map((d) =>
        d.material_id === materialId
          ? { ...d, min_progress_percent: clamped }
          : d
      )
    );
  };

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({
        enabled,
        materials: draft.map((d) => ({
          material_id: d.material_id,
          min_progress_percent: d.min_progress_percent,
        })),
      });
      toast({
        title: 'Gating policy saved',
        description: enabled
          ? 'Students will be blocked from this assessment until the listed materials are complete.'
          : 'Required materials saved. Toggle the gate on to enforce them.',
      });
    } catch (error: unknown) {
      const e = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
      toast({
        title: 'Could not save gating policy',
        description:
          e?.response?.data?.error?.message || e?.message || 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lock className="h-4 w-4" /> Required learning materials
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Students cannot start or submit this assessment until they finish
          the materials below. Turn the gate off to unlock without losing the
          configuration.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enforce gate</p>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? 'Locked until requirements are met.'
                : 'Configuration saved but not enforced.'}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          {isLoading && draft.length === 0 ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : draft.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No required materials yet. Add one below.
            </p>
          ) : (
            <ul className="space-y-2">
              {draft.map((d) => {
                const meta =
                  materialsById.get(d.material_id) ||
                  requiredData?.materials.find((m) => m.material_id === d.material_id)
                    ?.material;
                return (
                  <li
                    key={d.material_id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border bg-secondary/30 p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {meta?.title || 'Material'}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {d.material_id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-muted-foreground whitespace-nowrap">
                        Min %
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={d.min_progress_percent}
                        onChange={(e) =>
                          handleThreshold(d.material_id, Number(e.target.value))
                        }
                        className="h-8 w-20"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleRemove(d.material_id)}
                        aria-label="Remove required material"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={pickerValue}
            onChange={(e) => setPickerValue(e.target.value)}
            className="flex-1 h-9 rounded-md border bg-background px-2 text-sm"
            disabled={availableToAdd.length === 0}
          >
            <option value="">
              {availableToAdd.length === 0
                ? 'All course materials are already required'
                : 'Pick a material…'}
            </option>
            {availableToAdd.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleAdd}
            disabled={!pickerValue}
          >
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void handleSave();
            }}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save gating policy'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
