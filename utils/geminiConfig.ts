/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized access to the Gemini API key.
 *
 * The key is injected at build time by vite.config.ts from the
 * GEMINI_API_KEY environment variable (see .env.example).
 * It is never hardcoded in source.
 */
export function getApiKey(): string {
    const key = process.env.API_KEY;
    if (!key) {
        throw new Error(
            "Missing Gemini API key. Set GEMINI_API_KEY in your environment " +
            "or in a .env file (see .env.example) before building, then rebuild."
        );
    }
    return key;
}
