# MCPresPluto.jl

A Pluto.jl-based slide presentation engine using Shadow DOM for slide isolation and interactive support.

## Usage

In a Pluto notebook, use the slide DSL:

```julia
using MCPresPluto

slide_setup()  # Call once at the top to initialize styles

slide("My Title", "Subtitle")

double_slide("Left content", "Right content")

slide("Slide with bullets") do
    slide_part("First point")
    slide_part("Second point")
end
```

## PDF Export

There are two ways to produce a PDF: the in-notebook **Export PDF** button (no extra dependencies) and a programmatic **Playwright** exporter (headless, zero-click once set up).

### Option A — Export PDF button (recommended)

Add `slide_button()` to your notebook; alongside the "Slide Mode" toggle you'll see an **Export PDF** button. Clicking it renders the print layout and opens your browser's print dialog.

The one-time Chrome/Chromium print-dialog settings (save them as a preset):

- **Destination**: Save as PDF
- **Layout**: Landscape (usually auto-selected)
- **Paper size**: A4
- **Margins**: None (or "Default" — `preferCSSPageSize` makes them equivalent)
- **More settings → Background graphics**: **ON** (required — otherwise theme colours and the divider disappear)
- **Options → Headers and footers**: **OFF** (required — otherwise Chrome stamps a date/URL strip on every page)

After the dialog closes the notebook returns to its normal view.

### Option B — Playwright (headless, scripted)

#### One-time setup

Install Node.js (https://nodejs.org/) then install Playwright:

```bash
npm install -g playwright
npx playwright install chromium
```

### Exporting slides

When Pluto starts it prints a URL like:
```
Go to http://localhost:1234/?secret=XXXX to start writing ~ have fun!
```

Copy the secret token and the notebook URL from your browser, then call from a **separate Julia REPL** (not from within the notebook):

```julia
MCPresPluto.export_pdf(
    "http://localhost:1234/edit?id=<notebook-id>";
    secret = "XXXX",
    output = "slides.pdf"
)
```

- `url`: Notebook URL from your browser's address bar
- `secret`: Secret token from Pluto's terminal output
- `output`: Path for the output PDF file (default: `"slides.pdf"`)

> **Note**: Run `export_pdf` from a separate Julia session, not from within the notebook itself.

> **Note**: The Pluto notebook must be running while the export command executes. The exporter drives a headless Chromium browser to capture each slide as a PDF page.
