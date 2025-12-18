import { createEffect, createSignal, For, Show } from "solid-js"

interface Heading {
  id: string
  text: string
  level: number
}

interface TableOfContentsProps {
  content?: string
}

export default function TableOfContents(props: TableOfContentsProps) {
  const [headings, setHeadings] = createSignal<Heading[]>([])

  createEffect(() => {
    setTimeout(() => {
      const h2Elements = document.querySelectorAll(".blog-content h2")
      const extractedHeadings: Heading[] = []

      h2Elements.forEach((el, index) => {
        let id = el.id
        if (!id) {
          id = `heading-${index}`
          el.id = id
        }
        extractedHeadings.push({
          id,
          text: el.textContent || "",
          level: 2,
        })
      })

      setHeadings(extractedHeadings)
    }, 0)
  })

  return (
    <aside class="toc-sidebar">
      <Show when={headings().length > 0} fallback={<div />}>
        <div class="toc-content">
          <h3>Contents</h3>
          <ul class="toc-list">
            <For each={headings()}>
              {(heading) => (
                <li class={`toc-item toc-level-${heading.level}`}>
                  <a href={`#${heading.id}`} class="toc-link">
                    {heading.text}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </aside>
  )
}
