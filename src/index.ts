import {
  defineWebApplication,
  Extension,
  AppMenuItemExtension
} from '@opencloud-eu/web-pkg'
import { urlJoin } from '@opencloud-eu/web-client'
import '@opencloud-eu/extension-sdk/tailwind.css'
import type { RouteRecordRaw } from 'vue-router'
import { computed } from 'vue'
import { useGettext } from 'vue3-gettext'

export default defineWebApplication({
  setup() {
    const { $gettext } = useGettext()

    const appInfo = {
      id: 'dedupe',
      name: $gettext('Dedupe'),
      icon: 'file-copy-2',
      color: '#0f5f7a'
    }

    const routes: RouteRecordRaw[] = [
      {
        path: '/',
        redirect: `/${appInfo.id}/scan`
      },
      {
        path: '/scan',
        name: 'scan',
        component: () => import('./views/Dedupe.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Dedupe')
        }
      }
    ]

    const extensions = () => {
      return computed<Extension[]>(() => {
        const menuItems: AppMenuItemExtension[] = [
          {
            // registers a menu item for the app switcher
            id: `app.${appInfo.id}.menuItem`,
            type: 'appMenuItem',
            label: () => appInfo.name,
            color: appInfo.color,
            icon: appInfo.icon,
            path: urlJoin(appInfo.id)
          }
        ]
        return [...menuItems]
      })
    }

    return {
      appInfo,
      routes,
      extensions: extensions()
    }
  }
})
