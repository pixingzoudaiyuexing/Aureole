import { useEffect, useState } from 'react'
import { useSupportWidgetConfig } from './support-widget-queries'
import {
  disableSupportWidget,
  enableSupportWidget,
  isSupportWidgetIdentityReady,
  rejectSupportWidgetConfig,
  subscribeSupportWidgetIdentityRecheck,
} from './support-widget-runtime'

export function SupportWidgetRuntimeEffects() {
  const config = useSupportWidgetConfig()
  const [identityRevision, setIdentityRevision] = useState(0)
  const websiteId =
    config.isSuccess && config.data.crisp.enabled
      ? config.data.crisp.websiteId
      : null

  useEffect(
    () =>
      subscribeSupportWidgetIdentityRecheck(() => {
        setIdentityRevision((revision) => revision + 1)
      }),
    [],
  )

  useEffect(() => {
    if (websiteId) enableSupportWidget(websiteId)
    else if (config.isSuccess && !config.data.crisp.enabled)
      rejectSupportWidgetConfig()
    else disableSupportWidget()
    return disableSupportWidget
  }, [websiteId, config.isSuccess, config.data, identityRevision])

  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        websiteId &&
        isSupportWidgetIdentityReady()
      ) {
        enableSupportWidget(websiteId)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [websiteId])

  return null
}
