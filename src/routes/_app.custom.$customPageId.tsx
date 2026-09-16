import { createFileRoute } from '@tanstack/react-router'
import { getIframeCustomPageById } from '@/config/custom-pages'
import { CustomPageView } from '@/features/custom-pages/custom-page-view'

export const Route = createFileRoute('/_app/custom/$customPageId')({
  component: CustomPageRoute,
})

function CustomPageRoute() {
  const { customPageId } = Route.useParams()
  return <CustomPageView page={getIframeCustomPageById(customPageId)} />
}
