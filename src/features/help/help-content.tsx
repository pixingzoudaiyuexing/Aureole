import { Download } from 'lucide-react'
import { useState } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { HelpBlock, HelpInline } from './help-api'

function safeHttpsUrl(value: string) {
  if (
    Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0
      return code <= 0x1f || code === 0x7f || /\s/u.test(character)
    })
  )
    return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function SafeImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!safeHttpsUrl(src)) return null
  if (failed)
    return <span className="text-sm text-muted-foreground">{alt}</span>
  return (
    <img
      alt={alt}
      className="my-3 h-auto max-w-full"
      loading="lazy"
      onError={() => setFailed(true)}
      src={src}
    />
  )
}

function HelpInlines({ items }: { items: HelpInline[] }) {
  return items.map((item, index) => {
    const key = `${item.type}-${index}`
    switch (item.type) {
      case 'text':
        return <span key={key}>{item.text}</span>
      case 'strong':
        return (
          <strong key={key}>
            <HelpInlines items={item.children} />
          </strong>
        )
      case 'emphasis':
        return (
          <em key={key}>
            <HelpInlines items={item.children} />
          </em>
        )
      case 'break':
        return <br key={key} />
      case 'link':
        return safeHttpsUrl(item.href) ? (
          <a
            key={key}
            className="break-all text-primary underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
            href={item.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            <HelpInlines items={item.children} />
          </a>
        ) : (
          <span key={key}>
            <HelpInlines items={item.children} />
          </span>
        )
      case 'image':
        return <SafeImage key={key} src={item.src} alt={item.alt} />
      case 'download':
        return safeHttpsUrl(item.href) ? (
          <a
            key={key}
            className={cn(
              buttonVariants({
                size: 'sm',
                variant: item.slot === 'primary' ? 'default' : 'outline',
              }),
              'my-2 max-w-full break-words whitespace-normal',
            )}
            href={item.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Download className="size-4" aria-hidden="true" />
            {item.label}
          </a>
        ) : null
    }
  })
}

function HelpBlockView({ block }: { block: HelpBlock }) {
  if (block.type === 'paragraph')
    return (
      <p className="break-words leading-7">
        <HelpInlines items={block.children} />
      </p>
    )
  if (block.type === 'heading') {
    const content = <HelpInlines items={block.children} />
    if (block.level === 1)
      return <h2 className="break-words text-xl font-semibold">{content}</h2>
    if (block.level === 2)
      return <h3 className="break-words text-lg font-semibold">{content}</h3>
    return <h4 className="break-words text-base font-semibold">{content}</h4>
  }
  const items = block.items.map((item, index) => (
    <li className="break-words pl-1" key={index}>
      <HelpInlines items={item} />
    </li>
  ))
  return block.type === 'ordered-list' ? (
    <ol className="list-decimal space-y-2 pl-6 leading-7">{items}</ol>
  ) : (
    <ul className="list-disc space-y-2 pl-6 leading-7">{items}</ul>
  )
}

export function HelpArticleContent({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <div className="space-y-5 text-sm text-foreground sm:text-base">
      {blocks.map((block, index) => (
        <HelpBlockView key={index} block={block} />
      ))}
    </div>
  )
}
