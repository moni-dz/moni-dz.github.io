# Adding a blog post

Create a lowercase `.md` file in this folder. Use letters, numbers, hyphens, or underscores in its filename.

Start the file with this front-matter template:

```md
---
title: your post title
date: 2026-07-12
summary: One sentence shown in the post list.
tags: javascript, learning
---

## your first heading

Write the post here.
```

Then add the filename to `posts.json`:

```json
[
    "starting-a-markdown-blog.md",
    "your-new-post.md"
]
```

The post will be available at a shareable URL based on its filename, such as:

```text
blog.html?post=your-new-post
```

The built-in parser supports:

- headings from `#` through `######`
- paragraphs and block quotes
- ordered and unordered lists
- fenced code blocks and inline code
- bold and italic text
- links and images
- horizontal rules

Headings are also collected automatically to build the table of contents shown beside each post.

Raw HTML is shown as text instead of being inserted into the page. Posts must be viewed through a web server because browsers do not allow `fetch()` to load local files from a `file://` URL.
