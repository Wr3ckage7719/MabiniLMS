import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type SubmissionSortKey =
  | 'newest'
  | 'oldest'
  | 'student_asc'
  | 'student_desc'
  | 'status'
  | 'violations_desc';

export type SubmissionStatusFilter =
  | 'all'
  | 'on_time'
  | 'late'
  | 'graded'
  | 'pending'
  | 'with_violations';

export interface SubmissionFiltersState {
  search: string;
  status: SubmissionStatusFilter;
  sort: SubmissionSortKey;
}

export const DEFAULT_SUBMISSION_FILTERS: SubmissionFiltersState = {
  search: '',
  status: 'all',
  sort: 'newest',
};

interface SubmissionFiltersProps {
  value: SubmissionFiltersState;
  onChange: (next: SubmissionFiltersState) => void;
  totalCount: number;
  filteredCount: number;
}

export function SubmissionFilters({ value, onChange, totalCount, filteredCount }: SubmissionFiltersProps) {
  const filterActive =
    value.search.trim() !== '' || value.status !== 'all' || value.sort !== 'newest';

  return (
    <div className="space-y-2 mb-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            placeholder="Search student or assignment…"
            className="pl-8 h-8 text-xs rounded-lg"
          />
        </div>
        <Select
          value={value.status}
          onValueChange={(v) => onChange({ ...value, status: v as SubmissionStatusFilter })}
        >
          <SelectTrigger className="h-8 text-xs rounded-lg sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="on_time">On time</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="graded">Graded</SelectItem>
            <SelectItem value="pending">Pending grade</SelectItem>
            <SelectItem value="with_violations">With violations</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={value.sort}
          onValueChange={(v) => onChange({ ...value, sort: v as SubmissionSortKey })}
        >
          <SelectTrigger className="h-8 text-xs rounded-lg sm:w-48">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="student_asc">Student A→Z</SelectItem>
            <SelectItem value="student_desc">Student Z→A</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="violations_desc">Most violations</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Showing {filteredCount} of {totalCount}
        </span>
        {filterActive && (
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => onChange(DEFAULT_SUBMISSION_FILTERS)}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
