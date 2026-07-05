import 'vuetify/styles'
import { createVuetify } from 'vuetify'

// Use the browser's locale so the numeric fields accept that locale's decimal separator (a comma in
// de/nl and elsewhere); VNumberInput strips anything that is not the current locale's separator. UI
// text falls back to English. Defaults to en outside a browser.
const browserLocale = typeof navigator !== 'undefined' ? navigator.language : 'en'

// Dark theme matching the original desktop app: indigo primary, dark surfaces, green/amber accents.
export default createVuetify({
  locale: {
    locale: browserLocale,
    fallback: 'en',
  },
  theme: {
    defaultTheme: 'scanntune',
    themes: {
      scanntune: {
        dark: true,
        colors: {
          background: '#15171c',
          surface: '#1b1f27',
          'surface-light': '#252a33',
          'surface-bright': '#2b313c',
          primary: '#818cf8',
          secondary: '#a5b4fc',
          success: '#4ade80',
          warning: '#fbbf24',
          error: '#f87171',
          info: '#60a5fa',
          'on-surface': '#e7e9ee',
          'on-background': '#e7e9ee',
        },
      },
    },
  },
})
