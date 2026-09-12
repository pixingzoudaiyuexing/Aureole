import { LoaderCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function OnboardingLoading() {
  return (
    <section
      className="w-full max-w-[30rem] text-center"
      aria-live="polite"
      aria-busy="true"
    >
      <LoaderCircle
        className="mx-auto size-5 animate-spin text-primary"
        aria-hidden="true"
      />
      <h1 className="mt-4 text-lg font-semibold">正在读取注册要求</h1>
      <p className="mt-1 text-sm text-muted-foreground">请稍候。</p>
    </section>
  )
}

export function OnboardingError({ retry }: { retry: () => void }) {
  return (
    <section
      className="w-full max-w-[30rem]"
      aria-labelledby="onboarding-error-title"
    >
      <p className="text-xs font-semibold uppercase text-primary">
        服务配置未就绪
      </p>
      <h1 id="onboarding-error-title" className="mt-2 text-2xl font-semibold">
        暂时无法读取注册要求
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        为避免跳过必要验证，请重试获取当前要求。
      </p>
      <Button type="button" className="mt-6" onClick={retry}>
        <RefreshCw className="size-4" aria-hidden="true" />
        重试
      </Button>
    </section>
  )
}
