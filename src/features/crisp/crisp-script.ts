export const CRISP_SCRIPT_ID = 'aureole-crisp-loader'

export function getBootWebsiteId() {
  return document.getElementById(CRISP_SCRIPT_ID)?.dataset.bootWebsiteId ?? null
}
