---
title: starting a small Markdown blog
date: 2026-07-12
summary: How this portfolio turns plain Markdown files into readable blog posts.
tags: javascript, markdown, web
---

## why Markdown?

Markdown keeps the writing separate from the page layout. A post stays readable as plain text, while JavaScript handles how it appears in the browser.

## how this blog works

1. The browser loads `blog/posts.json` to discover the available posts.
2. It fetches each `.md` file and reads the metadata between the `---` markers.
3. The Markdown parser converts headings, lists, links, images, quotes, emphasis, and code into HTML.
4. The blog template displays the processed post inside a terminal window.

> The parser escapes raw HTML before rendering it, so Markdown content cannot quietly inject page elements or scripts.

## a tiny example

```js
const message = 'hello from Markdown';
console.log(message);
```

Adding the next post only requires a new Markdown file and one entry in `posts.json`.
