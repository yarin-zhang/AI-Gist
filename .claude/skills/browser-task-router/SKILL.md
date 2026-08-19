---
name: browser-task-router
description: Use this whenever a task involves interacting with a live website or web page — opening a URL, filling in a form, clicking buttons, taking screenshots, scraping or extracting page content, testing a web app, or logging into a site — even if the user doesn't say "browser" or name a specific tool. In this project, ego-browser (invoked as /ego-browser) is the default and preferred way to do browser automation, ahead of the built-in preview browser (Claude_Browser) or Claude in Chrome (claude-in-chrome) tools. Check this skill before reaching for those tools directly, and route to ego-browser instead unless the user explicitly asked for a different tool by name.
---

# Browser Task Router

## Why this exists

This project prefers `ego-browser` (ego-lite) for browser automation. It runs in its own isolated space and reuses the user's existing login state, so it doesn't compete with or disrupt the user's own browser session the way driving their real Chrome would. The built-in `Claude_Browser` and `claude-in-chrome` tools are general-purpose fallbacks — useful, but not the default here.

## What to do

When a task needs browser automation — opening a page, filling a form, clicking, taking a screenshot, scraping/extracting page data, testing a web app, or logging into a site:

1. Invoke the `Skill` tool with `skill: "ego-browser"`, passing the task details through `args` so it has full context (target URL, form values, what to extract, etc.).
2. Let ego-browser's own instructions drive the actual browser interaction rather than duplicating its logic here.
3. Don't call `mcp__Claude_Browser__*` or `mcp__claude-in-chrome__*` tools directly for this kind of task unless one of the exceptions below applies.

## When not to route to ego-browser

- **The user names a different tool or browser explicitly** — "open it in my real Chrome", "use claude-in-chrome", "use the preview browser". Honor that instead; an explicit ask overrides the default.
- **The task is previewing your own local dev server or build output**, not automating an external site. That's what `Claude_Browser`'s `preview_start` is for — it's about verifying the app you're building, a different job from the external-website automation ego-browser targets.
- **ego-browser is unavailable or errors out.** Fall back to the built-in browser tools and tell the user why you fell back.

## How to invoke

```
Skill({ skill: "ego-browser", args: "<the user's original browser task, with details intact>" })
```

Pass through enough of the original request that ego-browser doesn't have to guess — don't compress away URLs, field values, or extraction targets while summarizing.
