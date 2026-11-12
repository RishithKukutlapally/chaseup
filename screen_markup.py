import re


def prepare_screen(screen_name: str, markup: str) -> str:
    markup = re.sub(r"<script>.*?</script>", "", markup, flags=re.DOTALL)
    markup = re.sub(r'\s+onclick="[^"]*"', "", markup)
    if "data-screen=" not in markup:
        markup = markup.replace("<body ", f'<body data-screen="{screen_name}" ', 1)

    if screen_name == "chase-queue":
        markup = markup.replace(">418</span>", ' data-bind="summary-open">418</span>', 1)
        markup = markup.replace(">38</span>", ' data-bind="summary-overdue">38</span>', 1)
        markup = markup.replace(">17.4</span>", ' data-bind="summary-median">17.4</span>', 1)
        markup = re.sub(
            r'<tbody class="divide-y-0 text-body-sm font-body-sm">.*?</tbody>',
            '<tbody id="queue-body" class="divide-y-0 text-body-sm font-body-sm"></tbody>',
            markup,
            count=1,
            flags=re.DOTALL,
        )
        select_index = 0

        def mark_filter_select(match: re.Match[str]) -> str:
            nonlocal select_index
            labels = ("rm", "stage", "aging", "page-size")
            name = labels[select_index]
            select_index += 1
            opening, closing = match.group(0).split(">", 1)
            return f'{opening} data-filter="{name}">{closing}'

        markup = re.sub(
            r"<select\b[^>]*>.*?</select>",
            mark_filter_select,
            markup,
            count=4,
            flags=re.DOTALL,
        )
        markup = markup.replace(
            'title="Sort: Oldest Waiting Item (Default Descending)"',
            'title="Sort by oldest waiting item" id="queue-sort"',
            1,
        )
        markup = markup.replace(
            "<strong class=\"text-on-surface font-semibold\">418</strong>",
            '<strong class="text-on-surface font-semibold" data-bind="queue-total">0</strong>',
            1,
        )
        markup = markup.replace(
            "<!-- Primary Tabular High-Density Workbench -->",
            '<p id="queue-error" class="px-space-sm py-space-xs text-error" role="status" aria-live="polite"></p>\n<!-- Primary Tabular High-Density Workbench -->',
            1,
        )

    elif screen_name == "case-detail":
        markup = markup.replace(
            '<h1 class="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold truncate">',
            '<h1 id="case-title" class="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold truncate">',
            1,
        )
        markup = markup.replace(
            '<strong class="text-on-surface">NG-2026-8812</strong>',
            '<strong id="case-id" class="text-on-surface">NG-2026-8812</strong>',
            1,
        )
        markup = re.sub(
            r"<!-- Group 1: Constitutional Documents -->.*?(?=<!-- RIGHT 40% COLUMN)",
            '<div id="case-checklist" class="flex flex-col gap-space-md"></div>\n</div>\n',
            markup,
            count=1,
            flags=re.DOTALL,
        )
        markup = markup.replace(
            '<div id="case-checklist" class="flex flex-col gap-space-md"></div>',
            '<div id="case-checklist" class="flex flex-col gap-space-md"></div><p id="case-action-message" class="text-sm" role="status" aria-live="polite"></p>',
            1,
        )
        markup = markup.replace(
            '<div class="bg-surface-container-low rounded p-space-sm my-space-sm flex flex-col gap-space-2xs font-data-mono-sm text-data-mono-sm text-on-surface-variant">',
            '<div id="blocked-docs" class="bg-surface-container-low rounded p-space-sm my-space-sm flex flex-col gap-space-2xs font-data-mono-sm text-data-mono-sm text-on-surface-variant">',
            1,
        )
        markup = markup.replace(
            '<div class="relative pl-space-lg flex flex-col gap-space-lg before:content-[\'\'] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-container-high">',
            '<div id="case-timeline" class="relative pl-space-lg flex flex-col gap-space-lg before:content-[\'\'] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-container-high"></div>',
            1,
        )

    elif screen_name == "stage-analytics":
        markup = markup.replace(
            '<div class="grid grid-cols-1 lg:grid-cols-6 gap-space-sm items-stretch">',
            '<div id="stage-cards" class="grid grid-cols-1 lg:grid-cols-6 gap-space-sm items-stretch">',
            1,
        )
        markup = markup.replace(
            '<tbody class="divide-y divide-surface-container-low font-body-sm text-body-sm text-on-surface">',
            '<tbody id="chase-rounds-body" class="divide-y divide-surface-container-low font-body-sm text-body-sm text-on-surface">',
            1,
        )

    elif screen_name == "analyst-handoff":
        markup = markup.replace(
            "<!-- Success Toast Container (Hidden by default) -->",
            '<p id="handoff-message" class="text-sm" role="status" aria-live="polite"></p>\n<!-- Success Toast Container (Hidden by default) -->',
            1,
        )

    if "/static/app.js" not in markup:
        markup = markup.replace(
            "</body>",
            '<script src="/static/app.js" defer></script></body>',
            1,
        )
    if "/static/app.css" not in markup:
        markup = markup.replace(
            "</head>",
            '<link rel="stylesheet" href="/static/app.css"></head>',
            1,
        )
    return markup
