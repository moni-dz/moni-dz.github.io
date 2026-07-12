(function () {
    'use strict';

    const HIGHLIGHTER_WORKER_URL = 'blog-highlighter.worker.js';
    const POSTS_MANIFEST_URL = 'blog/posts.json';
    const POST_FILENAME_PATTERN = /^[a-z0-9][a-z0-9_-]*\.md$/i;
    const TAG_COLOR_COUNT = 5;
    const dateFormatter = new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    /**
     * @typedef {object} BlogHeading
     * @property {string} id Stable anchor generated from the heading text.
     * @property {number} level Markdown heading level from 1 through 6.
     * @property {string} text Plain heading text displayed in the table of contents.
     */

    /**
     * @typedef {object} BlogPost
     * @property {string} date Date written as YYYY-MM-DD.
     * @property {string} filename Markdown filename from the manifest.
     * @property {BlogHeading[]} headings Headings used to build the table of contents.
     * @property {string} html Safely rendered Markdown body.
     * @property {string} slug Filename without the .md extension.
     * @property {string} summary Short description shown in the post list.
     * @property {string[]} tags Searchable labels from the front matter.
     * @property {string} title Post title from the front matter.
     */

    const selectors = {
        content: '.blog-page-content',
        date: '.blog-post-date',
        description: '#blog-description',
        index: '#blog-index',
        list: '#blog-post-list',
        markdownBody: '.markdown-body',
        post: '#blog-post',
        status: '#blog-status',
        summary: '.blog-post-summary',
        tags: '.blog-post-tags',
        template: '#blog-post-template',
        title: '.blog-post-title',
        toc: '.blog-toc',
        tocList: '.blog-toc-list',
    };

    /** @type {Map<string, BlogPost>} */
    const postsBySlug = new Map();

    /**
     * Finds a required element and explains which selector is missing.
     *
     * @param {string} selector
     * @param {Document | DocumentFragment | Element} [root=document]
     * @returns {Element}
     */
    function queryRequired(selector, root = document) {
        const element = root.querySelector(selector);
        if (element) return element;

        throw new Error(`Missing required blog element: ${selector}`);
    }

    /**
     * Fetches and parses every Markdown file listed by the manifest.
     *
     * Browsers cannot list a directory, so posts.json acts as the small table of contents.
     *
     * @returns {Promise<BlogPost[]>}
     */
    async function loadPosts() {
        const manifestResponse = await fetch(POSTS_MANIFEST_URL);
        if (!manifestResponse.ok) {
            throw new Error(`Could not load ${POSTS_MANIFEST_URL}.`);
        }

        const filenames = await manifestResponse.json();
        if (!Array.isArray(filenames)) {
            throw new TypeError('The blog manifest must contain an array of filenames.');
        }

        const postPromises = filenames.map(async (filename) => {
            if (typeof filename !== 'string' || !POST_FILENAME_PATTERN.test(filename)) {
                throw new TypeError(`Invalid blog filename: ${String(filename)}`);
            }

            const response = await fetch(`blog/${filename}`);
            if (!response.ok) {
                throw new Error(`Could not load blog/${filename}.`);
            }

            return processPost(await response.text(), filename);
        });

        return Promise.all(postPromises);
    }

    /**
     * Separates a post's front matter from its Markdown body.
     *
     * Front-matter values intentionally stay simple: one `key: value` pair per line.
     *
     * @param {string} source Complete Markdown file.
     * @returns {{attributes: Record<string, string>, body: string}}
     */
    function parseFrontMatter(source) {
        const lines = source.replace(/\r\n?/g, '\n').split('\n');
        if (lines[0]?.trim() !== '---') {
            return {
                attributes: {},
                body: lines.join('\n'),
            };
        }

        const closingIndex = lines.findIndex((line, index) => {
            return index > 0 && line.trim() === '---';
        });

        if (closingIndex < 0) {
            throw new SyntaxError('Blog front matter is missing its closing --- marker.');
        }

        const attributes = {};
        for (const line of lines.slice(1, closingIndex)) {
            const separatorIndex = line.indexOf(':');
            if (separatorIndex < 1) continue;

            const key = line.slice(0, separatorIndex).trim().toLowerCase();
            const value = line.slice(separatorIndex + 1).trim();
            attributes[key] = value;
        }

        return {
            attributes,
            body: lines.slice(closingIndex + 1).join('\n').trim(),
        };
    }

    /**
     * Converts one Markdown file into the normalized data used by the templates.
     *
     * @param {string} source
     * @param {string} filename
     * @returns {BlogPost}
     */
    function processPost(source, filename) {
        const { attributes, body } = parseFrontMatter(source);
        const slug = filename.replace(/\.md$/i, '');
        const fallbackTitle = slug.replace(/[-_]+/g, ' ');
        const markdownDocument = parseMarkdownDocument(body);

        return {
            date: attributes.date ?? '',
            filename,
            headings: markdownDocument.headings,
            html: markdownDocument.html,
            slug,
            summary: attributes.summary ?? '',
            tags: (attributes.tags ?? '')
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            title: attributes.title || fallbackTitle,
        };
    }

    /**
     * Converts the supported block-level Markdown syntax to safe HTML.
     *
     * @param {string} markdown
     * @returns {{headings: BlogHeading[], html: string}}
     */
    function parseMarkdownDocument(markdown) {
        const output = [];
        const paragraphLines = [];
        const headings = [];
        const usedHeadingIds = new Set();
        let codeFence = null;
        let listType = null;

        const flushParagraph = () => {
            if (paragraphLines.length === 0) return;

            output.push(`<p>${renderInlineMarkdown(paragraphLines.join(' '))}</p>`);
            paragraphLines.length = 0;
        };

        const closeList = () => {
            if (!listType) return;

            output.push(`</${listType}>`);
            listType = null;
        };

        const openList = (requestedType) => {
            if (listType === requestedType) return;

            closeList();
            output.push(`<${requestedType}>`);
            listType = requestedType;
        };

        for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
            if (codeFence) {
                if (/^```\s*$/.test(line)) {
                    const languageClass = codeFence.language
                        ? ` class="language-${escapeHtml(codeFence.language)}"`
                        : '';
                    const escapedCode = escapeHtml(codeFence.lines.join('\n'));

                    output.push(`<pre><code${languageClass}>${escapedCode}</code></pre>`);
                    codeFence = null;
                } else {
                    codeFence.lines.push(line);
                }
                continue;
            }

            const fenceMatch = line.match(/^```([a-z0-9_-]*)\s*$/i);
            if (fenceMatch) {
                flushParagraph();
                closeList();
                codeFence = {
                    language: fenceMatch[1],
                    lines: [],
                };
                continue;
            }

            if (line.trim() === '') {
                flushParagraph();
                closeList();
                continue;
            }

            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                flushParagraph();
                closeList();
                const level = headingMatch[1].length;
                const headingText = getPlainHeadingText(headingMatch[2]);
                const headingId = createHeadingId(headingText, usedHeadingIds);

                headings.push({
                    id: headingId,
                    level,
                    text: headingText,
                });
                const renderedHeading = renderInlineMarkdown(headingMatch[2]);
                output.push(`<h${level} id="${headingId}">${renderedHeading}</h${level}>`);
                continue;
            }

            if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
                flushParagraph();
                closeList();
                output.push('<hr>');
                continue;
            }

            const unorderedItem = line.match(/^\s*[-*+]\s+(.+)$/);
            if (unorderedItem) {
                flushParagraph();
                openList('ul');
                output.push(`<li>${renderInlineMarkdown(unorderedItem[1])}</li>`);
                continue;
            }

            const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);
            if (orderedItem) {
                flushParagraph();
                openList('ol');
                output.push(`<li>${renderInlineMarkdown(orderedItem[1])}</li>`);
                continue;
            }

            const quoteMatch = line.match(/^>\s?(.*)$/);
            if (quoteMatch) {
                flushParagraph();
                closeList();
                output.push(`<blockquote>${renderInlineMarkdown(quoteMatch[1])}</blockquote>`);
                continue;
            }

            closeList();
            paragraphLines.push(line.trim());
        }

        flushParagraph();
        closeList();

        if (codeFence) {
            output.push(`<pre><code>${escapeHtml(codeFence.lines.join('\n'))}</code></pre>`);
        }

        return {
            headings,
            html: output.join('\n'),
        };
    }

    /**
     * Converts Markdown to HTML while keeping the detailed heading data internal.
     *
     * @param {string} markdown
     * @returns {string}
     */
    function parseMarkdown(markdown) {
        return parseMarkdownDocument(markdown).html;
    }

    /**
     * Removes common inline Markdown markers for readable table-of-contents labels.
     *
     * @param {string} markdown
     * @returns {string}
     */
    function getPlainHeadingText(markdown) {
        return markdown
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[`*_~]/g, '')
            .trim();
    }

    /**
     * Generates a unique, URL-safe heading anchor.
     *
     * @param {string} text
     * @param {Set<string>} usedIds
     * @returns {string}
     */
    function createHeadingId(text, usedIds) {
        const slug = text
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const baseId = `section-${slug || 'untitled'}`;
        let id = baseId;
        let suffix = 2;

        while (usedIds.has(id)) {
            id = `${baseId}-${suffix}`;
            suffix += 1;
        }

        usedIds.add(id);
        return id;
    }

    /**
     * Renders inline Markdown after preserving code, links, and images as protected tokens.
     *
     * @param {string} text
     * @returns {string}
     */
    function renderInlineMarkdown(text) {
        const tokens = [];
        const preserve = (html) => {
            const token = `\uE000${tokens.length}\uE001`;
            tokens.push({ html, token });
            return token;
        };

        let workingText = text.replace(/`([^`\n]+)`/g, (_match, code) => {
            return preserve(`<code>${escapeHtml(code)}</code>`);
        });

        workingText = workingText.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, url) => {
            const safeUrl = sanitizeUrl(url);
            if (!safeUrl) return match;

            return preserve(
                `<img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(alt)}" loading="lazy">`,
            );
        });

        workingText = workingText.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
            const safeUrl = sanitizeUrl(url);
            if (!safeUrl) return match;

            return preserve(`<a href="${escapeHtml(safeUrl)}">${escapeHtml(label)}</a>`);
        });

        let html = escapeHtml(workingText)
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/__([^_]+)__/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/(^|[^\w])_([^_]+)_(?!\w)/g, '$1<em>$2</em>');

        for (const token of tokens) {
            html = html.split(token.token).join(token.html);
        }

        return html;
    }

    /**
     * Allows ordinary web, email, anchor, and relative URLs while rejecting script URLs.
     *
     * @param {string} url
     * @returns {string}
     */
    function sanitizeUrl(url) {
        try {
            const baseUrl = typeof window === 'undefined'
                ? 'https://example.com/'
                : window.location.href;
            const parsedUrl = new URL(url, baseUrl);
            const allowedProtocols = new Set(['http:', 'https:', 'mailto:']);

            return allowedProtocols.has(parsedUrl.protocol) ? url : '';
        } catch (_error) {
            return '';
        }
    }

    /**
     * Escapes text before it is inserted through innerHTML.
     *
     * @param {string} value
     * @returns {string}
     */
    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    /**
     * Converts a YYYY-MM-DD value into a local Date without UTC timezone shifts.
     *
     * @param {string} value
     * @returns {Date | null}
     */
    function parsePostDate(value) {
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;

        const year = Number(match[1]);
        const monthIndex = Number(match[2]) - 1;
        const day = Number(match[3]);
        const date = new Date(year, monthIndex, day);
        const isExactDate = date.getFullYear() === year
            && date.getMonth() === monthIndex
            && date.getDate() === day;

        return isExactDate ? date : null;
    }

    /**
     * @param {BlogPost} post
     * @returns {string}
     */
    function formatPostDate(post) {
        const date = parsePostDate(post.date);
        return date ? dateFormatter.format(date) : 'undated';
    }

    /**
     * Displays the list of available posts as links to their dedicated URLs.
     *
     * @param {BlogPost[]} posts
     */
    function renderPostList(posts) {
        const list = queryRequired(selectors.list);
        const status = queryRequired(selectors.status);
        list.replaceChildren();

        if (posts.length === 0) {
            status.textContent = 'no posts yet.';
            status.hidden = false;
            list.hidden = true;
            return;
        }

        for (const post of posts) {
            const item = document.createElement('li');
            const link = document.createElement('a');
            const title = document.createElement('strong');
            const summary = document.createElement('span');
            const meta = document.createElement('span');

            link.className = 'blog-post-link';
            link.href = `blog.html?post=${encodeURIComponent(post.slug)}`;
            title.className = 'blog-post-link-title';
            title.textContent = post.title;
            summary.className = 'blog-post-link-summary';
            summary.textContent = post.summary;
            meta.className = 'blog-post-link-meta';
            const tagSummary = post.tags.length ? ` / ${post.tags.join(', ')}` : '';
            meta.textContent = `${formatPostDate(post)}${tagSummary}`;

            link.append(title, summary, meta);
            item.appendChild(link);
            list.appendChild(item);
        }

        status.hidden = true;
        list.hidden = false;
    }

    /**
     * Builds a linked table of contents from the headings collected by the Markdown parser.
     *
     * @param {DocumentFragment} fragment Cloned post template.
     * @param {BlogHeading[]} headings Parsed Markdown headings.
     */
    function renderTableOfContents(fragment, headings) {
        const toc = queryRequired(selectors.toc, fragment);
        const tocList = queryRequired(selectors.tocList, fragment);
        tocList.replaceChildren();

        for (const heading of headings) {
            const item = document.createElement('li');
            const link = document.createElement('a');

            item.className = `blog-toc-level-${heading.level}`;
            link.href = `#${heading.id}`;
            link.textContent = heading.text;
            link.addEventListener('click', (event) => {
                event.preventDefault();
                scrollBlogContentToHeading(heading.id, true);
            });
            item.appendChild(link);
            tocList.appendChild(item);
        }

        toc.hidden = headings.length === 0;
    }

    /**
     * Selects a stable palette position so the same tag always uses the same color.
     *
     * @param {string} tag
     * @returns {number}
     */
    function getTagColorIndex(tag) {
        let hash = 0;

        for (const character of tag.toLowerCase()) {
            hash = (hash * 31 + character.codePointAt(0)) >>> 0;
        }

        return hash % TAG_COLOR_COUNT;
    }

    /**
     * Renders post tags as individually colored badges without decorative hashtag characters.
     *
     * @param {Element} container
     * @param {string[]} tags
     */
    function renderTags(container, tags) {
        container.replaceChildren();

        for (const tag of tags) {
            const badge = document.createElement('span');

            badge.className = `blog-tag blog-tag-color-${getTagColorIndex(tag)}`;
            badge.textContent = tag;
            container.appendChild(badge);
        }
    }

    /**
     * Sends code to a module worker so Shiki cannot block page interaction.
     *
     * @param {{code: string, language: string}[]} blocks
     * @returns {Promise<string[]>} Highlighted HTML in the same order as the input blocks.
     */
    function requestCodeHighlights(blocks) {
        return new Promise((resolve, reject) => {
            let worker;

            try {
                worker = new Worker(HIGHLIGHTER_WORKER_URL, { type: 'module' });
            } catch (error) {
                reject(error);
                return;
            }

            worker.addEventListener('message', (event) => {
                worker.terminate();

                if (event.data?.error) {
                    reject(new Error(event.data.error));
                    return;
                }

                if (!Array.isArray(event.data?.highlightedBlocks)
                    || event.data.highlightedBlocks.length !== blocks.length) {
                    reject(new Error('The syntax highlighter returned an invalid response.'));
                    return;
                }

                resolve(event.data.highlightedBlocks);
            }, { once: true });

            worker.addEventListener('error', (event) => {
                worker.terminate();
                reject(new Error(event.message || 'The syntax-highlighting worker failed.'));
            }, { once: true });

            worker.postMessage({ blocks });
        });
    }

    /**
     * Replaces Markdown code blocks with syntax-highlighted Shiki output.
     *
     * The original escaped code remains readable when the CDN is unavailable.
     *
     * @param {Element} root Rendered Markdown container.
     * @returns {Promise<void>}
     */
    async function highlightCodeBlocks(root) {
        const codeBlocks = [...root.querySelectorAll('pre > code')];
        if (codeBlocks.length === 0) return;

        try {
            const blocks = codeBlocks.map((codeBlock) => {
                const languageClass = [...codeBlock.classList]
                    .find((className) => className.startsWith('language-'));
                return {
                    code: codeBlock.textContent,
                    language: languageClass?.slice('language-'.length) || 'text',
                };
            });
            const highlightedBlocks = await requestCodeHighlights(blocks);

            highlightedBlocks.forEach((highlightedHtml, index) => {
                const codeBlock = codeBlocks[index];

                const template = document.createElement('template');
                // Shiki returns a complete, escaped <pre class="shiki"> element.
                template.innerHTML = highlightedHtml;
                const highlightedBlock = template.content.firstElementChild;
                const originalBlock = codeBlock.parentElement;

                if (highlightedBlock && originalBlock) {
                    originalBlock.replaceWith(highlightedBlock);
                }
            });
        } catch (error) {
            console.warn('Syntax highlighting could not be loaded.', error);
        }
    }

    /**
     * Scrolls the blog's inner content area without moving the page viewport.
     *
     * @param {string} headingId Generated heading anchor.
     * @param {boolean} updateHash Whether the address bar should reflect the section.
     */
    function scrollBlogContentToHeading(headingId, updateHash) {
        const content = queryRequired(selectors.content);
        const heading = document.getElementById(headingId);
        if (!heading) return;

        const contentRect = content.getBoundingClientRect();
        const headingRect = heading.getBoundingClientRect();
        const top = content.scrollTop + headingRect.top - contentRect.top - 16;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        content.scrollTo({
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
            top: Math.max(0, top),
        });

        if (updateHash) {
            window.history.replaceState(null, '', `#${headingId}`);
        }
    }

    /**
     * Fills the reusable HTML template with one processed Markdown post.
     *
     * @param {string} slug
     * @returns {boolean} Whether a matching post was found.
     */
    function showPost(slug) {
        const post = postsBySlug.get(slug);
        if (!post) return false;

        const template = queryRequired(selectors.template);
        if (!(template instanceof HTMLTemplateElement)) {
            throw new TypeError('The blog post template must be a <template> element.');
        }

        const fragment = template.content.cloneNode(true);
        const date = queryRequired(selectors.date, fragment);
        const summary = queryRequired(selectors.summary, fragment);
        const tags = queryRequired(selectors.tags, fragment);
        const postContainer = queryRequired(selectors.post);
        const index = queryRequired(selectors.index);

        queryRequired(selectors.title, fragment).textContent = post.title;
        date.textContent = formatPostDate(post);
        date.setAttribute('datetime', post.date);
        renderTags(tags, post.tags);
        summary.textContent = post.summary;
        summary.hidden = !post.summary;

        // parseMarkdown escapes raw HTML and sanitizes URLs before this assignment.
        queryRequired(selectors.markdownBody, fragment).innerHTML = post.html;
        renderTableOfContents(fragment, post.headings);

        postContainer.replaceChildren(fragment);
        void highlightCodeBlocks(queryRequired(selectors.markdownBody, postContainer));
        index.hidden = true;
        postContainer.hidden = false;
        document.title = `${post.title} // lyt blog`;
        queryRequired(selectors.description).setAttribute('content', post.summary || post.title);

        const requestedSection = window.location.hash.slice(1);
        if (requestedSection) {
            window.requestAnimationFrame(() => {
                scrollBlogContentToHeading(requestedSection, false);
            });
        }

        return true;
    }

    /** Loads, sorts, and renders the blog without blocking the rest of the portfolio. */
    async function initBlog() {
        const status = queryRequired(selectors.status);

        try {
            const posts = await loadPosts();
            posts.sort((first, second) => {
                const firstTime = parsePostDate(first.date)?.getTime() ?? 0;
                const secondTime = parsePostDate(second.date)?.getTime() ?? 0;
                return secondTime - firstTime;
            });

            for (const post of posts) {
                postsBySlug.set(post.slug, post);
            }

            renderPostList(posts);

            const requestedSlug = new URL(window.location.href).searchParams.get('post');
            if (requestedSlug && !showPost(requestedSlug)) {
                status.classList.add('blog-error');
                status.textContent = 'that post could not be found.';
                status.hidden = false;
            }
        } catch (error) {
            console.error('The blog could not be loaded.', error);
            status.classList.add('blog-error');
            status.textContent =
                'posts could not be loaded. try viewing the site through a web server.';
        }
    }

    const parserApi = {
        getTagColorIndex,
        parseFrontMatter,
        parseMarkdown,
        processPost,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = parserApi;
    } else if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initBlog, { once: true });
        } else {
            void initBlog();
        }
    }
}());
