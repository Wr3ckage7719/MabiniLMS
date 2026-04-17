import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bugReportsService, BugReport, BugReportSeverity, BugReportStatus } from '@/services/bug-reports.service'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Bug, Loader2, Search } from 'lucide-react'

const statusOptions: Array<{ value: BugReportStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In Review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

const severityOptions: Array<{ value: BugReportSeverity | 'all'; label: string }> = [
  { value: 'all', label: 'All Severities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const getStatusBadgeVariant = (status: BugReportStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case 'resolved':
      return 'default'
    case 'closed':
      return 'secondary'
    case 'in_review':
      return 'outline'
    default:
      return 'destructive'
  }
}

const getSeverityBadgeClass = (severity: BugReportSeverity): string => {
  switch (severity) {
    case 'critical':
      return 'bg-red-600/20 text-red-300 border-red-500/40'
    case 'high':
      return 'bg-orange-600/20 text-orange-300 border-orange-500/40'
    case 'medium':
      return 'bg-blue-600/20 text-blue-300 border-blue-500/40'
    case 'low':
    default:
      return 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
  }
}

export default function BugReportsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<BugReportStatus | 'all'>('all')
  const [severityFilter, setSeverityFilter] = useState<BugReportSeverity | 'all'>('all')
  const [draftStatusById, setDraftStatusById] = useState<Record<string, BugReportStatus>>({})
  const [draftNotesById, setDraftNotesById] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['admin-bug-reports', statusFilter, severityFilter],
    queryFn: () =>
      bugReportsService.list({
        status: statusFilter,
        severity: severityFilter,
        limit: 50,
        offset: 0,
      }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, status, admin_notes }: { id: string; status: BugReportStatus; admin_notes?: string }) =>
      bugReportsService.updateStatus(id, { status, admin_notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bug-reports'] })
      toast({
        title: 'Bug report updated',
        description: 'Status and notes were saved successfully.',
      })
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to update bug report'

      toast({
        title: 'Update failed',
        description: message,
        variant: 'destructive',
      })
    },
  })

  const filteredReports = useMemo(() => {
    const reports = data?.reports || []
    const search = searchTerm.trim().toLowerCase()
    if (!search) {
      return reports
    }

    return reports.filter((report) => {
      const haystack = [
        report.title,
        report.description,
        report.reporter_name,
        report.reporter_email,
        report.page_url || '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(search)
    })
  }, [data?.reports, searchTerm])

  const formatDate = (isoDate: string): string => {
    return new Date(isoDate).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getDraftStatus = (report: BugReport): BugReportStatus => {
    return draftStatusById[report.id] || report.status
  }

  const getDraftNotes = (report: BugReport): string => {
    if (Object.prototype.hasOwnProperty.call(draftNotesById, report.id)) {
      return draftNotesById[report.id]
    }
    return report.admin_notes || ''
  }

  const handleSave = (report: BugReport) => {
    const status = getDraftStatus(report)
    const adminNotes = getDraftNotes(report).trim()

    updateMutation.mutate({
      id: report.id,
      status,
      admin_notes: adminNotes.length > 0 ? adminNotes : '',
    })
  }

  return (
    <div className="h-full bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Bug Reports</h1>
            <p className="text-muted-foreground">Review user-submitted issues and track resolution status.</p>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filteredReports.length} of {data?.total || 0} reports
          </div>
        </div>

        <Card className="bg-card border-border p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search title, reporter, email, or page"
                className="pl-9 bg-background border-input text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as BugReportStatus | 'all')}
            >
              <SelectTrigger className="bg-background border-input text-foreground">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={severityFilter}
              onValueChange={(value) => setSeverityFilter(value as BugReportSeverity | 'all')}
            >
              <SelectTrigger className="bg-background border-input text-foreground">
                <SelectValue placeholder="Filter by severity" />
              </SelectTrigger>
              <SelectContent>
                {severityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {isLoading ? (
          <Card className="bg-card border-border p-12">
            <div className="flex flex-col items-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p>Loading bug reports...</p>
            </div>
          </Card>
        ) : filteredReports.length === 0 ? (
          <Card className="bg-card border-border p-12">
            <div className="flex flex-col items-center text-muted-foreground">
              <Bug className="w-14 h-14 mb-3 opacity-50" />
              <p>No bug reports match your current filters.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredReports.map((report) => {
              const draftStatus = getDraftStatus(report)
              const draftNotes = getDraftNotes(report)
              const isPending = updateMutation.isPending

              return (
                <Card key={report.id} className="bg-card border-border p-5 space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-foreground">{report.title}</h2>
                        <Badge variant={getStatusBadgeVariant(report.status)}>{report.status.replace('_', ' ')}</Badge>
                        <Badge variant="outline" className={getSeverityBadgeClass(report.severity)}>
                          {report.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-foreground/80">{report.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Submitted by {report.reporter_name} ({report.reporter_email}) on {formatDate(report.created_at)}
                      </p>
                      {report.page_url && (
                        <p className="text-xs text-primary break-all">Page: {report.page_url}</p>
                      )}
                    </div>
                  </div>

                  {report.steps_to_reproduce && (
                    <div className="rounded-md border border-border bg-background/60 p-3">
                      <p className="text-xs font-semibold text-foreground/80 mb-1">Steps to Reproduce</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.steps_to_reproduce}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                    <div>
                        <p className="text-xs text-muted-foreground mb-1">Set Status</p>
                      <Select
                        value={draftStatus}
                        onValueChange={(value) =>
                          setDraftStatusById((previous) => ({
                            ...previous,
                            [report.id]: value as BugReportStatus,
                          }))
                        }
                      >
                        <SelectTrigger className="bg-background border-input text-foreground">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-2">
                      <p className="text-xs text-muted-foreground mb-1">Admin Notes</p>
                      <Textarea
                        value={draftNotes}
                        onChange={(event) =>
                          setDraftNotesById((previous) => ({
                            ...previous,
                            [report.id]: event.target.value,
                          }))
                        }
                        className="bg-background border-input text-foreground"
                        rows={3}
                        placeholder="Optional notes for triage or resolution details"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={() => handleSave(report)}
                      disabled={isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Update'
                      )}
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
