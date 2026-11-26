import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useApi } from '../components/useApi'
import { Loading } from '../components/Loader'
import { Card } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { entityLink } from '@/lib/links'

function formatTimestamp(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function AuditLog() {
  const { data: logs, loading } = useApi(api.auditLogs)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="text-xl font-bold text-foreground">Audit Log</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Who did what, across the last 500 recorded actions
          </p>
        </div>
      </div>

      {loading ? (
        <Loading what="audit log" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs || []).map((row) => {
                const link = entityLink(row.entity_type, row.entity_id)
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatTimestamp(row.created_at)}
                    </TableCell>
                    <TableCell>{row.user_email || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.action}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-muted-foreground">{row.entity_type}</span>
                      {row.entity_id && (
                        <>
                          {' · '}
                          {link ? (
                            <Link to={link} className="text-primary hover:underline">
                              {row.entity_id}
                            </Link>
                          ) : (
                            <span>{row.entity_id}</span>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[380px] truncate text-muted-foreground">
                      {Object.keys(row.details || {}).length
                        ? JSON.stringify(row.details)
                        : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
              {!logs?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No actions logged yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
