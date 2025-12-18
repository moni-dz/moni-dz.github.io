interface NavigationProps {
  onPanelSelect?: (panelId: string) => void
  isBlogPage?: boolean
}

export default function Navigation(props: NavigationProps) {
  let themeButton: HTMLButtonElement | undefined

  const toggleTheme = () => {
    const root = document.documentElement
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches

    if (prefersDark && root.style.colorScheme !== 'light') {
      root.style.colorScheme = 'light'
    } else if (prefersLight && root.style.colorScheme !== 'dark') {
      root.style.colorScheme = 'dark'
    } else if (root.style.colorScheme === 'light') {
      root.style.colorScheme = 'dark'
    } else {
      root.style.colorScheme = 'light'
    }
  }

  return (
    <nav>
      <ul>
        {props.isBlogPage ? (
          <li>
            <a href="/" data-panel="welcome">
              home
            </a>
          </li>
        ) : (
          <li>
            <a href="#top" data-panel="welcome" onclick={() => props.onPanelSelect?.('welcome')}>
              home
            </a>
          </li>
        )}
        <li>
          <a href="/blog" class="blog-nav-link" data-external="true">
            blog
          </a>
        </li>
        {!props.isBlogPage && (
          <>
            <li>
              <a href="#top" data-panel="about" onclick={() => props.onPanelSelect?.('about')}>
                about
              </a>
            </li>
            <li>
              <a href="#top" data-panel="refs" onclick={() => props.onPanelSelect?.('refs')}>
                refs
              </a>
            </li>
          </>
        )}
      </ul>
      <button
        ref={themeButton}
        class="toggle-theme"
        type="button"
        aria-label="Toggle theme"
        onclick={toggleTheme}
        style={{
         color: 'var(--text-color)',
         'background-color': 'var(--bg-color)',
         'font-size': '1rem',
         padding: '0.25rem 0.75rem',
         'display': 'inline-block',
         border: 'none',
         'font-family': 'inherit',
         margin: '0',
         'line-height': 'normal',
         cursor: 'pointer',
         'border-radius': '0',
         transition: 'all 0.3s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.9'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1'
        }}
      >
        toggle light/dark mode
      </button>
    </nav>
  )
}
