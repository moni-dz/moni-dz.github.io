import { codeToHtml } from 'https://esm.sh/shiki@3.0.0';

const SHIKI_THEMES = {
    light: 'github-light',
    dark: 'github-dark',
};

/**
 * Highlights one block, falling back to plain text for an unknown language name.
 *
 * @param {{code: string, language: string}} block
 * @returns {Promise<string>}
 */
async function highlightBlock(block) {
    try {
        return await codeToHtml(block.code, {
            lang: block.language,
            themes: SHIKI_THEMES,
        });
    } catch (_unknownLanguageError) {
        return codeToHtml(block.code, {
            lang: 'text',
            themes: SHIKI_THEMES,
        });
    }
}

/** Highlights a batch sequentially so Shiki can reuse its cached highlighter. */
self.addEventListener('message', async (event) => {
    try {
        if (!Array.isArray(event.data?.blocks)) {
            throw new TypeError('The syntax highlighter expected an array of code blocks.');
        }

        const highlightedBlocks = [];
        for (const block of event.data.blocks) {
            if (typeof block?.code !== 'string' || typeof block?.language !== 'string') {
                throw new TypeError('A syntax-highlighting request was malformed.');
            }

            highlightedBlocks.push(await highlightBlock(block));
        }

        self.postMessage({ highlightedBlocks });
    } catch (error) {
        self.postMessage({
            error: error instanceof Error ? error.message : 'Syntax highlighting failed.',
        });
    }
});
