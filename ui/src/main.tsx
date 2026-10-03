import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initializeData } from './data'
import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'

initializeData().then(() => {
  if (isTauri()) {
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]')
      if (!anchor || !/^https?:/.test(anchor.href)) return
      event.preventDefault()
      void openUrl(anchor.href).catch(() => { console.error('无法打开外部链接') })
    })
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}).catch((error) => {
  document.getElementById('root')!.textContent = `本地数据初始化失败：${error}`
})
