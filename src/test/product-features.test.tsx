import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProductFeatures } from '@/features/catalog/product-features'

describe('Product feature display', () => {
  it.each([undefined, []])(
    'renders no module for omitted or empty features',
    (features) => {
      const { container } = render(<ProductFeatures features={features} />)
      expect(container).toBeEmptyDOMElement()
      expect(screen.queryByRole('list', { name: '套餐功能' })).toBeNull()
    },
  )

  it('shows supported and unsupported states and preserves order and duplicates', () => {
    render(
      <ProductFeatures
        features={[
          { feature: 'Streaming', support: true },
          { feature: 'Games', support: false },
          { feature: 'Streaming', support: true },
        ]}
      />,
    )
    const items = within(
      screen.getByRole('list', { name: '套餐功能' }),
    ).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      '支持Streaming',
      '不支持Games',
      '支持Streaming',
    ])
    expect(items[0]?.querySelector('svg')).toHaveClass(
      'lucide-check',
      'text-green-600',
    )
    expect(items[1]?.querySelector('svg')).toHaveClass('lucide-x')
    expect(items[1]).toHaveClass('text-muted-foreground')
  })

  it('renders hostile markup literally without creating description DOM or scripts', () => {
    const feature =
      '<script>window.bad=true</script><img src=x onerror=alert(1)><iframe srcdoc="bad"></iframe><style>body{display:none}</style>'
    const { container } = render(
      <ProductFeatures features={[{ feature, support: true }]} />,
    )
    expect(screen.getByText(feature)).toBeInTheDocument()
    expect(container.querySelector('script, img, iframe, style')).toBeNull()
  })
})
