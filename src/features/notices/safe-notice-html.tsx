import DOMPurify from 'dompurify'

const allowedTags = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'blockquote',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'pre',
  'code',
  'a',
]
const allowedUri = /^(?:https?:|mailto:|tel:|\/|#)/i

DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (node.nodeName.toLowerCase() !== 'a') data.keepAttr = false
})

export function SafeNoticeHtml({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: allowedUri,
    FORBID_TAGS: [
      'style',
      'script',
      'img',
      'iframe',
      'object',
      'embed',
      'svg',
      'math',
      'form',
      'input',
      'textarea',
      'select',
      'button',
      'video',
      'audio',
      'source',
      'canvas',
      'link',
      'meta',
      'base',
    ],
  })
  const safeText = DOMPurify.sanitize(sanitized, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  })
  if (!safeText.trim())
    return (
      <p className="text-sm text-muted-foreground">
        公告正文没有可安全展示的内容。
      </p>
    )
  return (
    <div
      className="notice-content min-w-0 text-sm leading-7 [&_a]:break-all [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_li]:ml-5 [&_ol]:list-decimal [&_p+p]:mt-4 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-4 [&_ul]:list-disc"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  )
}
