import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '@/app/providers/theme-provider'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const options: Array<{
  value: Theme
  label: string
  icon: typeof Monitor
}> = [
  { value: 'system', label: 'Use system theme', icon: Monitor },
  { value: 'light', label: 'Use light theme', icon: Sun },
  { value: 'dark', label: 'Use dark theme', icon: Moon },
]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div
      className="flex h-11 items-center rounded-md border border-border bg-background p-0.5"
      role="group"
      aria-label="Theme"
    >
      {options.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'size-10 text-muted-foreground hover:bg-accent',
                theme === value &&
                  'bg-secondary text-foreground shadow-[inset_0_0_0_1px_var(--border)]',
              )}
              aria-label={label}
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              <Icon className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
