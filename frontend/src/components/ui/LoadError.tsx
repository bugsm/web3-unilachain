import { CircleAlert } from "lucide-react"
import { userMessage } from "@/api/errors"
import { Button } from "./Button"

export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-bad-soft px-4 py-3 text-sm text-rose-700">
      <CircleAlert size={16} className="shrink-0" />
      <span className="flex-1">{userMessage(error)}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  )
}
