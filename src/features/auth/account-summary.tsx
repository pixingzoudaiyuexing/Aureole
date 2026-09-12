import { useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from './auth-context'

const statusLabels = {
  active: '正常',
  expired: '已过期',
  disabled: '已停用',
} as const

export function AccountSummary() {
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()

  if (!currentUser) return null

  const handleLogout = async () => {
    logout()
    await navigate({ to: '/login', replace: true })
  }

  return (
    <div className="border-t border-border p-3">
      <div className="min-w-0 px-2 pb-2">
        <p className="truncate text-sm font-medium" title={currentUser.email}>
          {currentUser.email}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          账户状态：{statusLabels[currentUser.status]}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-start text-muted-foreground"
        onClick={handleLogout}
      >
        <LogOut className="size-4" aria-hidden="true" />
        退出登录
      </Button>
    </div>
  )
}
